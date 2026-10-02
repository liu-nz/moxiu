# Online 阶段 · 数据库迁移脚本（待执行）

> 状态：**尚未执行**。云服务环境激活成功后才能运行。
> 执行方式：逐条通过 MCP 工具 `workbuddy_cloudservice_db_exec_sql` 提交，
> `mode` 见每条标注。**一次只能提交一条语句**。

---

## 1. 存档表

```sql
CREATE TABLE saves (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id    TEXT        NOT NULL DEFAULT auth.uid(),
  owner_name  TEXT,
  data        JSONB       NOT NULL,
  version     INT         NOT NULL DEFAULT 4,
  play_ms     BIGINT      NOT NULL DEFAULT 0,
  stage       INT         NOT NULL DEFAULT 0,
  realm       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)
```
`mode: migrate`

要点：
- `owner_id` 必须是 **TEXT**，因为 `auth.uid()` 返回文本（形如 `EchhGXFadSANiCSaVim2wQ`），写成 `uuid` 会在建表时直接类型不匹配。
- 客户端**永远不传 `owner_id`**，由 `DEFAULT auth.uid()` 在服务端填。
- `stage` / `realm` / `play_ms` 是从 `data` 里抽出来的冗余列，只为将来做全服排行榜与统计时不必解 JSONB。

```sql
COMMENT ON TABLE saves IS '墨修 · 玩家存档（一人一行，JSONB 全量快照）'
```
`mode: migrate`

## 2. 唯一约束：一个账号一行

```sql
ALTER TABLE saves ADD CONSTRAINT saves_owner_unique UNIQUE (owner_id)
```
`mode: migrate`

云存档用 `upsert(onConflict: owner_id)`，靠这个约束保证不会写出行。

## 3. RLS：仅本人可读写

```sql
ALTER TABLE saves ENABLE ROW LEVEL SECURITY
```
`mode: migrate`

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saves TO authenticated, anon
```
`mode: migrate`

```sql
DROP POLICY IF EXISTS saves_read_own ON saves
```
`mode: migrate`

```sql
CREATE POLICY saves_read_own ON saves FOR SELECT TO authenticated, anon USING (owner_id = auth.uid())
```
`mode: migrate`

```sql
DROP POLICY IF EXISTS saves_insert_own ON saves
```
`mode: migrate`

```sql
CREATE POLICY saves_insert_own ON saves FOR INSERT TO authenticated, anon WITH CHECK (owner_id = auth.uid())
```
`mode: migrate`

```sql
DROP POLICY IF EXISTS saves_update_own ON saves
```
`mode: migrate`

```sql
CREATE POLICY saves_update_own ON saves FOR UPDATE TO authenticated, anon USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())
```
`mode: migrate`

```sql
DROP POLICY IF EXISTS saves_delete_own ON saves
```
`mode: migrate`

```sql
CREATE POLICY saves_delete_own ON saves FOR DELETE TO authenticated, anon USING (owner_id = auth.uid())
```
`mode: migrate`

注意：`UPDATE` 必须同时写 `USING` 和 `WITH CHECK`。只写 `USING` 的话，玩家可以把行的 `owner_id` 改成别人的——等于把自己的存档送给别人。

## 4. 校验

```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
```
`mode: read`

```sql
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'saves'
```
`mode: read`

期望：`saves` 的 `rowsecurity` 为 `true`，且有 4 条策略（SELECT / INSERT / UPDATE / DELETE）。

---

## 5. 后续批次会用到（先不执行）

第二、三批做排行榜、交易行、聊天时需要这些表，届时再建：

| 表 | 用途 | 关键策略 |
|---|---|---|
| `profiles` | 公开的玩家名片（昵称、境界、战力快照） | 全员可读，仅本人可写 |
| `market_listings` | 玩家交易行挂单 | 全员可读，仅本人可增删 |
| `guild_members` | 道盟成员 | 同盟可读 |
| `chat_messages` | 聊天频道 | 按频道可读，仅本人可发 |
| `world_events` | 全服世界事件（由服务端时间推导，全员可读） | 只读 |

**一个必须提前说明的边界**：托管后端只有客户端 SDK + 行级隔离，没有服务端计算的位置。
所以这些表里的数值都由客户端上报，理论上可被篡改。排行榜与交易行按「社交与展示」定位，
不追求竞技公平——界面上会如实标注数据来源。
