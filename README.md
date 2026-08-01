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

当前页面使用本地演示数据，方便先验证信息层级和操作路径。下一步将接入 Supabase Auth、PostgreSQL 和 Storage，并把演示数据替换为真实家庭空间数据。没有配置 Supabase 环境变量时，页面仍可作为本地演示运行。

## 本地运行

```bash
npm install
npm run dev
```

## GitHub / Vercel / Supabase

1. 将仓库根目录设置为 `Gucang`。
2. Vercel 使用默认 Next.js 构建设置；仓库中的 `vercel.json` 与 `.nvmrc` 已固定安装和 Node 版本。
3. 在 Vercel 项目环境变量中配置 `.env.example` 的两个 Supabase 公共变量。
4. 在 Supabase SQL Editor 或 CLI 中执行 `supabase/migrations/0001_initial.sql`。
5. Storage 创建私有 bucket `collection-images`，路径按 `households/{household_id}/...` 组织，并按迁移文件中的家庭成员规则配置 Storage policies。

密钥不写入 GitHub；`.env*` 已被 `.gitignore` 忽略，只有 `.env.example` 会提交。

## 数据库

迁移文件位于 `supabase/migrations/0001_initial.sql`，包含：

- 用户资料与家庭成员
- IP、角色、品类、系列
- 自由树状位置
- 款式档案与实物实例
- 图片元数据
- 移动历史、活动记录、导出记录
- 家庭空间级 RLS 访问策略
