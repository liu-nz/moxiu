/**
 * authFlow.js —— 邮箱认证流程状态机（与 SDK 解耦）
 *
 * 为什么要单独抽出来：账号功能里最容易写错的不是网络调用，而是一堆**时序规则**——
 *   · 必须先发码再提交，提交时不得重复发码
 *   · 换了收件邮箱必须重新发码
 *   · 新用户注册必须带密码，老用户登录不带
 *   · 发送失败（含限流）不能声称「已发送」，也不能进入验证
 *   · 文案里不得暴露某个邮箱是否已注册
 *
 * 这些规则与网络无关，放在这里就能用假端口完整测出来。
 * 接云服务时只需实现一个 authPort（对应 cloud.auth.*），本文件不用改。
 *
 * 平台约束：**Web 应用只支持邮箱登录**（手机短信 / 微信登录仅限小程序）。
 */

export const AUTH_STATUS = {
  IDLE: 'idle',
  SENDING: 'sending',
  SENT: 'sent',
  SUBMITTING: 'submitting',
  SIGNED_IN: 'signed-in',
  ERROR: 'error',
};

export function isValidEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function isValidPassword(v) {
  return typeof v === 'string' && v.length >= 6;
}

/**
 * 创建一个认证流程。
 * @param {object} port 认证端口，形状对应 cloud.auth.*：
 *   sendOtp({email}) / verifyOtp({...}) / signInWithPassword({email,password})
 *   resetPasswordForEmail(email) / signOut() / getSession() / onAuthStateChange(cb)
 */
export function createAuthFlow(port) {
  const snapshot = {
    status: AUTH_STATUS.IDLE,
    email: '',
    message: '',
    error: '',
    isExistingUser: null,
    user: null,
    hasPendingCode: false,
  };

  /** 发码挑战：必须跨事件保存，且只有显式重新发送才允许替换 */
  let pending = null;
  /** 找回密码的凭据句柄 */
  let resetHandle = null;

  const listeners = new Set();

  function emit(patch) {
    Object.assign(snapshot, patch);
    for (const fn of listeners) {
      try { fn({ ...snapshot }); } catch { /* 订阅方出错不影响主流程 */ }
    }
    return { ...snapshot };
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn({ ...snapshot });
    return () => listeners.delete(fn);
  }

  function reset(patch = {}) {
    pending = null;
    resetHandle = null;
    return emit({
      status: AUTH_STATUS.IDLE,
      message: '',
      error: '',
      isExistingUser: null,
      hasPendingCode: false,
      ...patch,
    });
  }

  /* ---------------- 验证码：发送 ---------------- */
  async function sendCode(email) {
    const value = (email || '').trim();
    if (!isValidEmail(value)) {
      return emit({ status: AUTH_STATUS.ERROR, error: '请输入有效的邮箱地址', email: value });
    }
    if (snapshot.status === AUTH_STATUS.SENDING) {
      return { ...snapshot };   // 发送中，忽略重复点击
    }

    emit({ status: AUTH_STATUS.SENDING, email: value, error: '', message: '' });

    let res;
    try {
      res = await port.sendOtp({ email: value });
    } catch (e) {
      // 网络异常同样不能声称已发送
      return emit({ status: AUTH_STATUS.ERROR, error: '发送失败，请稍后重试', hasPendingCode: false });
    }

    if (!res || res.error) {
      // 发送失败（含限流）不得留下可用挑战
      pending = null;
      return emit({
        status: AUTH_STATUS.ERROR,
        error: (res && res.error && res.error.message) || '发送失败，请稍后重试',
        hasPendingCode: false,
      });
    }

    pending = {
      email: value,
      verificationId: res.data.verificationId,
      isExistingUser: !!res.data.isExistingUser,
    };
    return emit({
      status: AUTH_STATUS.SENT,
      email: value,
      isExistingUser: pending.isExistingUser,
      hasPendingCode: true,
      message: '验证码已发送，请查收邮箱',
      error: '',
    });
  }

  /* ---------------- 验证码：提交 ---------------- */
  /**
   * @param {string} code 验证码
   * @param {string} [password] 新用户注册时的密码
   * @param {string} [currentEmail] 输入框里当前的邮箱；用于识别「发码之后又改了邮箱」
   */
  async function submitCode(code, password, currentEmail) {
    const email = (currentEmail || snapshot.email || '').trim();
    const value = (code || '').trim();

    if (!isValidEmail(email)) {
      return emit({ status: AUTH_STATUS.ERROR, error: '请先输入邮箱并获取验证码', email });
    }
    if (!pending || pending.email !== email) {
      // 换了收件邮箱，或压根没发过码——提示为当前邮箱重新获取，且不发新码
      return emit({
        status: AUTH_STATUS.ERROR,
        email,
        error: '请先为当前邮箱获取验证码',
        hasPendingCode: false,
      });
    }
    if (!value) {
      return emit({ status: AUTH_STATUS.ERROR, error: '请输入验证码' });
    }
    // 新用户注册必须带密码：邮箱注册没有密码的账号以后永远无法用密码登录
    if (!pending.isExistingUser && !isValidPassword(password)) {
      return emit({ status: AUTH_STATUS.ERROR, error: '首次注册需设置至少 6 位密码' });
    }

    emit({ status: AUTH_STATUS.SUBMITTING, email, error: '' });

    let res;
    try {
      res = await port.verifyOtp({
        email: pending.email,
        verificationId: pending.verificationId,
        isExistingUser: pending.isExistingUser,
        token: value,
        password: pending.isExistingUser ? undefined : password,
      });
    } catch (e) {
      return emit({ status: AUTH_STATUS.ERROR, error: '验证失败，请稍后重试' });
    }

    if (!res || res.error) {
      // 验证码错：保留挑战，允许直接用同一个码重试，不重新发码
      return emit({
        status: AUTH_STATUS.SENT,
        error: (res && res.error && res.error.message) || '验证码不正确',
        message: '',
        hasPendingCode: true,
      });
    }

    reset();
    return emit({
      status: AUTH_STATUS.SIGNED_IN,
      user: res.data && res.data.user ? res.data.user : null,
      message: '已登录',
    });
  }

  /* ---------------- 密码登录 ---------------- */
  async function signInWithPassword(email, password) {
    const value = (email || '').trim();
    if (!isValidEmail(value)) {
      return emit({ status: AUTH_STATUS.ERROR, error: '请输入有效的邮箱地址', email: value });
    }
    if (!password) {
      return emit({ status: AUTH_STATUS.ERROR, error: '请输入密码', email: value });
    }

    emit({ status: AUTH_STATUS.SUBMITTING, email: value, error: '' });

    let res;
    try {
      res = await port.signInWithPassword({ email: value, password });
    } catch (e) {
      return emit({ status: AUTH_STATUS.ERROR, error: '登录失败，请稍后重试' });
    }

    if (!res || res.error) {
      // 统一文案：不区分「账号不存在」与「密码错误」
      return emit({ status: AUTH_STATUS.ERROR, error: '账号或密码不正确' });
    }

    reset();
    return emit({
      status: AUTH_STATUS.SIGNED_IN,
      user: res.data && res.data.user ? res.data.user : null,
      message: '已登录',
    });
  }

  /* ---------------- 找回密码 ---------------- */
  async function requestReset(email) {
    const value = (email || '').trim();
    if (!isValidEmail(value)) {
      return emit({ status: AUTH_STATUS.ERROR, error: '请输入有效的邮箱地址', email: value });
    }
    emit({ status: AUTH_STATUS.SENDING, email: value, error: '' });

    let res;
    try {
      res = await port.resetPasswordForEmail(value);
    } catch (e) {
      return emit({ status: AUTH_STATUS.ERROR, error: '发送失败，请稍后重试' });
    }
    if (!res || res.error) {
      return emit({ status: AUTH_STATUS.ERROR, error: (res?.error?.message) || '发送失败，请稍后重试' });
    }

    resetHandle = res.data && res.data.updateUser ? res.data.updateUser : null;
    return emit({
      status: AUTH_STATUS.SENT,
      email: value,
      message: '重置验证码已发送，请查收邮箱',
      error: '',
    });
  }

  async function completeReset(code, newPassword) {
    if (!resetHandle) {
      return emit({ status: AUTH_STATUS.ERROR, error: '请先获取重置验证码' });
    }
    if (!isValidPassword(newPassword)) {
      return emit({ status: AUTH_STATUS.ERROR, error: '新密码至少 6 位' });
    }
    emit({ status: AUTH_STATUS.SUBMITTING, error: '' });

    let res;
    try {
      res = await resetHandle({ nonce: (code || '').trim(), password: newPassword });
    } catch (e) {
      return emit({ status: AUTH_STATUS.ERROR, error: '重置失败，请稍后重试' });
    }
    if (!res || res.error) {
      return emit({ status: AUTH_STATUS.ERROR, error: (res?.error?.message) || '验证码不正确' });
    }

    reset();
    return emit({ status: AUTH_STATUS.SIGNED_IN, message: '密码已重置，已登录' });
  }

  /* ---------------- 会话 ---------------- */
  async function restoreSession() {
    let res;
    try {
      res = await port.getSession();
    } catch (e) {
      return { ...snapshot };
    }
    if (res && !res.error && res.data) {
      return emit({ status: AUTH_STATUS.SIGNED_IN, user: res.data.user || null });
    }
    return { ...snapshot };
  }

  async function signOut() {
    try { await port.signOut(); } catch { /* 本地状态照清 */ }
    return reset({ message: '已退出登录' });
  }

  function watchAuthChanges() {
    if (typeof port.onAuthStateChange !== 'function') return () => {};
    return port.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') reset({ message: '已退出登录' });
      else if (session) emit({ status: AUTH_STATUS.SIGNED_IN, user: session.user || null });
    });
  }

  return {
    subscribe,
    getState: () => ({ ...snapshot }),
    sendCode,
    submitCode,
    signInWithPassword,
    requestReset,
    completeReset,
    restoreSession,
    signOut,
    watchAuthChanges,
    /** 仅测试用：暴露当前挑战，验证「不重复发码」这类规则 */
    _pending: () => (pending ? { ...pending } : null),
  };
}
