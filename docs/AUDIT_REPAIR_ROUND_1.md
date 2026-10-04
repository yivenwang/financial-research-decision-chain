# 第一轮审计修复：安全与调用可靠性

日期：2026-10-04。基于 main `fe9af2b9450c069fc979cb539cd43454783a95fa`；保留所有者批准的 2026-10-08 23:59:59（北京时间）审验窗口。

## 变更与边界

| 原审计项 | 本轮处理 | 尚需验证或后续处理 |
| --- | --- | --- |
| C-01 HTTP / 安全浏览器 API | 问题和 Memo 在调用前检查 secure context、hash、UUID 和 Web Locks；不满足则明确阻断 | 现有线上 HTTP 尚未切到 HTTPS；准备 IP 证书配置，必须外网操作验收 |
| C-02 会话 | 随机 nonce、签发和到期时间、独立服务端 HMAC 密钥；拒绝旧派生哈希、篡改、未来签发及过期票据；轮换访问码或签名密钥使全部会话失效 | 保留到 Oct 8 的既定访问窗口，不偷偷恢复 8 小时；尚无账号、单会话撤销和角色体系。注销仍仅清除当前浏览器 cookie |
| C-03 依赖 | Next / eslint-config-next 固定 16.3.8，更新兼容传递依赖；关闭当前产品不需要的公开图片优化服务 | 本地生产依赖审计 0 个已知漏洞，不证明未知漏洞或所有开发依赖已清理；CI 在合并前重扫 |
| H-09 请求体 | 登录 / Memo / Question 共用流式字节限制、总读取时限、断连取消；模型响应读取共用原调用 deadline，保留既定单次预算与无重试 | Nginx 请求缓冲、超时与连接数配置仍是未安装模板 |
| H-10 手动验收脚本 | Proxy 仅对两个已授权模型 API 支持原有 Bearer 认证；脚本 readiness GET 带认证；其他页面和 API 不被 Bearer 放开 | 本轮没有 dispatch 手动付费验收，不宣称新真实问题内容通过 |
| H-11 保存失败（部分） | Question 先保留返回结果和任务票据再保存；Memo 先显示结果再追加台账；保存失败提示立即导出，不引导重复生成 | 页面关闭、导航、网络响应丢失的服务端持久任务和幂等恢复尚未实现 |
| H-13 登录限制（部分） | 单进程固定窗口，最多 20 次 / 分钟；429 + Retry-After；不信任客户端 IP 标头 | 独立进程不共享；Nginx 的真实来源 IP 限速待安装。跨端点预算、重复执行幂等及跨进程并发是第二轮，不标记整个 H-13 关闭 |
| H-14 门禁和响应头（部分） | 静态文件明确列举，只开放 `_next/static`；拒绝任意扩展名和 `_next/data` 豁免；加 nosniff、DENY、frame-ancestors、object-src、base-uri、form-action | CSP 本轮不包含 script-src / nonce，不能当作完整 XSS 防护；还需严格脚本策略设计及验证 |
| L-04 登录跳转 | URL 同 origin 校验，拒绝反斜杠、协议相对路径与控制字符 | 外网登录后回到各工作台路由仍待人工操作验收 |
| L-05 状态文件 | 更新修复基线、实际部署阻塞和发布条件；CI 加 lint、类型及生产依赖扫描 | 远程发布 SHA、监控、备份恢复仍待服务器验证 |

冻结引擎、金融公式、阈值、K-07、Prompt、模型每次 token / timeout 预算、EG-01 / EG-02 和原始历史均保留。没有读取或测试 S-07，没有真实模型请求。数值容错、K-07 口径、数据真实性、台账全量 schema / 多标签一致性、服务端恢复和预算幂等继续按审计台账处理。本轮不是整体审计问题全部关闭。

## 本地验证

- `npm test`：70 项通过，含 12 项门禁和请求安全测试。
- `npm run lint`：0 错误，4 个原有未使用变量警告。生成的 PDF.js worker 从应用 lint 范围排除；它的字节一致性由生产 runtime 检查。
- `npx tsc --noEmit`、`npm run build`：通过。
- `npm audit --omit=dev`：生产依赖 0 个已知漏洞（该次数据库快照）。
- 生产 runtime：通过；覆盖实际生产 Proxy、两个 API 的受限 Bearer readiness、签名登录 cookie、响应头、静态 worker、超大登录体和真实登录限速。冻结 V5 迁移校验通过，冻结财务源文件无变更。
- 浏览器回归由普通 Web CI 的现有 S-05 / 隔离 S-06、问题和整套 UI 测试执行；离线传输标注 NOT-LIVE，真实内容和生产人工验收保持 pending。

## 无域名的 HTTPS 发布准备

用户确认暂无域名。无需把购买域名作为前置条件，可先使用现有 `192.144.168.226` 的公开 IP 证书。官方依据：[Let's Encrypt / Certbot IP certificates](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)。截至该官方说明，webroot 需要 Certbot 5.4+；IP 证书约 6 天有效，需自动续期和 deploy hook 让 Nginx 读取新证书。不要使用不被浏览器信任的 staging 证书作为正式 HTTPS 验收。

本环境只尝试 SSH 的 `node --version` 只读检查，连接 `vect@192.144.168.226:22` 返回 `Network is unreachable`。没有读取服务器 env、部署、改防火墙、重启服务或修改 Nginx。GitHub 授权与服务器可达性是两件事。

实施顺序（连接恢复后由操作者执行，必须先核对现有服务目录 / 启动方式，不直接覆盖）：

1. 记录当前 release SHA、进程管理方式、监听端口与 Nginx 站点；受限权限备份配置，不输出环境中的真实密钥。将 Next 仅监听 loopback，云安全组开放 80 / 443，关闭公网 3000 直连。
2. 在原 HTTP origin 导出需要保留的研究版本、问题、Memo / 修订与审核记录。`http://IP` 和 `https://IP` 是不同 localStorage origin；本轮没有完整自动迁移 / 导入，不清除旧 origin 数据，不声称用户历史自动迁移成功。必要时先实现和验证恢复工具。
3. 部署经过 CI 的固定提交到新 release 目录，在服务器受限 env 文件配置 `REVIEW_SESSION_SECRET`（独立高熵值，至少 32 字符），保留已有 provider key / access code / 截止时间。旧 cookie 不再有效，需重新登录。可在 `apps/web` 目录用以下代码**只写文件，不显示密钥**；若已有签名项则拒绝覆盖：

   ```bash
   node --input-type=module -e 'import {readFileSync,appendFileSync,chmodSync} from "node:fs"; import {randomBytes} from "node:crypto"; const p=".env.local"; const s=readFileSync(p,"utf8"); if(/^REVIEW_SESSION_SECRET=/m.test(s)) throw new Error("Review existing signing key instead of overwriting"); appendFileSync(p,"\nREVIEW_SESSION_SECRET="+randomBytes(32).toString("hex")+"\n",{mode:0o600}); chmodSync(p,0o600);'
   ```

   若当前服务用 systemd `EnvironmentFile` 或其它受限 env 文件，应写入实际文件，并确认进程加载；上述 `.env.local` 示例不是要求更改已用的秘密存储机制。
4. 在当前 HTTP vhost 增加专用 webroot challenge location，先验证只暴露挑战文件，再尝试：

   ```bash
   sudo certbot certonly --staging --preferred-profile shortlived --webroot --webroot-path /var/www/letsencrypt --ip-address 192.144.168.226
   ```

   先检查 Certbot 版本、ACME 账户和公开 80 可达性，之后再移除 `--staging` 签发可信证书。ACME 账户及协议接受由实际运营者处理。证书路径以签发结果为准。
5. 使用 [Nginx IP HTTPS 模板](../deploy/nginx/beacon-ip-https.conf.example) 对照现有配置。模板假设 upstream 为 `127.0.0.1:3000`；实际端口待核对。不要先启用尚不存在的证书路径。设置 `RESEARCH_APP_ORIGIN=https://192.144.168.226`，完成 `nginx -t` 后再 reload / 切换服务；保留模型 150 秒预算所需的 190 秒代理读取窗口。
6. 设置续期 timer 和成功签发后的 `nginx -t && systemctl reload nginx` deploy hook；确认 dry-run、timer 日志、下一次执行和证书剩余寿命告警。短证书没有自动续期验证不得算上线完成。
7. 从外网验证可信 TLS、HTTP 跳转、Cookie Secure / HttpOnly / SameSite、浏览器 secure context、Web Locks、导入 / 审核 / 保存 / 导出 / 回滚。普通模型流程使用明确的测试传输或未配置状态；付费模型验收沿用单独批准的手动批次，不为验收自动调用模型。
8. 回滚保留上一个 release 和配置。安全回退优先暂时关闭生成服务；不通过恢复公网明文入口、弱会话或跳过门禁来宣称恢复成功。用户原始导出与旧 origin 数据继续保留。

## 第二轮待决策

下一轮优先是跨端点额度与幂等、服务端持久任务和完整恢复、台账 schema / 事务一致性。涉及新增数据存储和成本的部署选择先给具体方案。金融核心改变另列 before / after 及受影响结果，再由所有者确认；不把一般“全线接管”解释为代替所有者作投资判断。
