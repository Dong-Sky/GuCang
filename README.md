# 谷仓 Gucang

家庭二次元收藏管理系统。V1 以手机浏览为主，支持两个独立账号共享家庭收藏空间。

## 当前已完成

- Quiet Collection 极简 UI 基础壳
- 首页、IP 一览、IP 详情、位置一览、位置详情、待办页
- 搜索、IP/全部谷子切换、位置逐层浏览、详情抽屉、快速暂存弹窗
- PWA manifest
- Supabase V1 数据库迁移与 RLS 基础规则
- GitHub/Vercel 基础配置、Node 版本约束、CI 构建检查
- Supabase 浏览器端与服务端客户端边界、健康检查接口

当前页面已接入 Supabase Auth、PostgreSQL 和私有 Storage。未登录时显示登录/注册入口；登录后可以创建或加入家庭空间，再管理真实收藏数据。

## 本地运行

```bash
npm install
npm run dev
```

## GitHub / Vercel / Supabase

1. 将仓库根目录设置为 `Gucang`。
2. Vercel 使用默认 Next.js 构建设置；仓库中的 `vercel.json` 与 `.nvmrc` 已固定安装和 Node 版本。
3. 在 Vercel 项目环境变量中配置 `.env.example` 的两个 Supabase 公共变量。
4. 按顺序执行 `supabase/migrations/0001_initial.sql`、`0002_storage.sql` 和 `0003_v1_workflows.sql`（线上项目已经应用）。
5. Storage 使用私有 bucket `collection-images`，路径按 `households/{household_id}/...` 组织，策略已写入 `0002_storage.sql`。

密钥不写入 GitHub；`.env*` 已被 `.gitignore` 忽略，只有 `.env.example` 会提交。

## 数据库

迁移文件位于 `supabase/migrations/`，包含：

- 用户资料与家庭成员
- IP、角色、品类、系列
- 自由树状位置
- 款式档案与实物实例
- 图片元数据
- 移动历史、活动记录、导出记录
- 家庭空间级 RLS 访问策略
- 邀请接受 RPC、原子移动记录、更新时间触发器

## V1 已接入流程

- 邮箱注册/登录、家庭空间创建和邀请链接加入
- IP、角色、品类、系列、款式档案与实物实例
- 自由树状位置、位置照片与收藏移动历史
- 浏览器端图片压缩、WebP 缩略图、私有 Storage
- 快速暂存和“待完善”任务
- 7 天回收站、恢复和过期记录自动清理
- ZIP 备份（JSON、CSV、图片和移动记录）
