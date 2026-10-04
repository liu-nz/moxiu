export const ROLE_NAME_PATTERN = /^[一-龥A-Za-z0-9_]{2,16}$/;

export function validRoleName(name) {
  return typeof name === 'string' && ROLE_NAME_PATTERN.test(name.trim());
}

export async function readPlayerProfile(client, userId) {
  const { data, error } = await client.from('moxiu_player_profiles')
    .select('uid,role_name,name_confirmed').eq('user_id', userId).single();
  if (error || !data || !Number.isInteger(data.uid) || data.uid < 10000001 ||
      !validRoleName(data.role_name) || typeof data.name_confirmed !== 'boolean') {
    throw new Error('账号档案读取失败，请检查网络后重新载入；进度不会被覆盖');
  }
  return Object.freeze({ uid: String(data.uid), roleName: data.role_name, nameConfirmed: data.name_confirmed });
}
