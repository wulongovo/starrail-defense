# 星铁原版模型来源与接入记录

更新日期：2026-09-29。此记录区分官方活动页直链与社区存档镜像；仅记录已实际下载、解析的资源，不将检索结果视作已接入模型。

## v0.3 模型扩展

全部 92 张可部署卡已使用 3D，对应 90 份角色 PMX；存护、同谐开拓者共用基础人物模型。加上迷迷、萨姆、3 件武器，共 95 个角色及武器模型包。迷迷与记忆主角均为各自模型。欢愉主角的公开镜像包带武器，但沿用基础主角服饰，内部名称仍为记忆命途，清单保留此身份说明；不宣称新服装。另已导入 19 套普通怪物/召唤物，以及帕姆和五个地区首领（含归寂三相）的 8 套真实模型，来源与验证见扩展清单及本文末节。

新增文件的逐项地址、原包和 PMX 哈希、原始版权注释与规约保存在 `model-expansion-legacy.json` 和 `model-expansion-modern.json`；逐卡映射见 `model-coverage.json`。本地 ZIP 将这些资料汇总为“模型接入清单.json”。初始 18 模型的来源证据仍保留在下表。公开镜像未经对应官方原包逐字节复核，不能把镜像服务器称为官方来源端点。

新导入贴图缩至最大 256 像素，初始批次最大 512 像素；原始文件另存，模型包保留原 PMX 字节。艾丝妲、青雀、停云和阿格莱雅原包存在错误贴图引用，按同包现有脸部/服饰材质与 UV 核验后显式映射；只修运行时贴图引用，不改原始 PMX。修复理由与初始全透明材质清单见 `model-material-repairs.json`。初始透明表情层保持隐藏，未启用表情 morph 或原版布料、头发物理。

动画采用本作编写的位移驱动步态、脚步 IK 与起停过渡；不是下载到的官方动作。为支持完整离线预览，运行包使用 gzip 内嵌并在首次使用模型时解压。

## 初始 18 个模型的下载与转换记录

18 位角色的原 PMX、原纹理及使用规则保存在 `public/assets/models/<id>/`。本地渲染包为同目录的 `bundle.json`，包含 PMX 与缩至最大 512 像素的漫反射贴图；原文件未被转换覆盖。下表数据来自转换器对真实模型的解析。

|角色|目录 id|来源类型|原模型文件|顶点 / 三角面 / 骨骼|模型来源|
|---|---|---|---|---|---|
|知更鸟|`robin`|官方活动页 CDN|`星穹铁道—知更鸟（改）.pmx`|30921 / 49756 / 520|[来源](https://activity.hdslb.com/blackboard/maxfiles/d0f1584af802138e3e94a47e7d419635/1715061714157.zip)|
|三月七|`march`|官方活动页 CDN|`三月七 1.0.pmx`|21218 / 28039 / 371|[来源](https://activity.hdslb.com/blackboard/static/20221205/d7f098333308ba7412aa9b57601bfa1d/KkVjYLh8y3.zip)|
|杰帕德|`gepard`|社区公开镜像|`杰帕德.pmx`|28040 / 34063 / 166|[来源](https://drive.google.com/drive/folders/16GcwWJW741Nq9pvZYKQhAvQUewMJmOq3)|
|砂金|`aventurine`|官方活动页 CDN|`星穹铁道—砂金9.pmx`|28447 / 39360 / 370|[来源](https://activity.hdslb.com/blackboard/maxfiles/d0f1584af802138e3e94a47e7d419635/1711445363261.zip)|
|女开拓者|`trailblazer`|官方活动页 CDN|`女主1.0.pmx`|20030 / 25322 / 545|[来源](https://activity.hdslb.com/blackboard/static/20221205/d7f098333308ba7412aa9b57601bfa1d/GFamSO99HT.zip)|
|黑塔|`herta`|官方活动页 CDN|`黑塔.pmx`|21908 / 26234 / 613|[来源](https://activity.hdslb.com/blackboard/static/20230601/952f7c986d30869651e51a154c9fc2bc/29DY5Kmjul.zip)|
|姬子|`himeko`|社区公开镜像|`姬子2.0.pmx`|28394 / 36574 / 740|[来源](https://drive.google.com/drive/folders/1Z0nnz5ATSU3ED3nynoa1Le1Nt_Y6uIge)|
|丹恒|`dan`|官方活动页 CDN|`丹恒.pmx`|23481 / 28311 / 350|[来源](https://activity.hdslb.com/blackboard/static/20221205/d7f098333308ba7412aa9b57601bfa1d/YPughPO7Vb.zip)|
|白露|`bailu`|官方活动页 CDN|`白露1.0.pmx`|23687 / 33346 / 548|[来源](https://activity.hdslb.com/blackboard/static/20230829/952f7c986d30869651e51a154c9fc2bc/46Z6WYWYGS.zip)|
|卡芙卡|`kafka`|官方活动页 CDN|`卡芙卡.pmx`|18546 / 23800 / 498|[来源](https://activity.hdslb.com/blackboard/static/20230717/952f7c986d30869651e51a154c9fc2bc/sCo8renFJl.zip)|
|银狼|`silverWolf`|官方活动页 CDN|`银狼.pmx`|25838 / 32070 / 440|[来源](https://activity.hdslb.com/blackboard/static/20230601/952f7c986d30869651e51a154c9fc2bc/Iz7PqiFe3p.zip)|
|流萤|`firefly`|官方活动页 CDN|`流萤3.0.pmx`|28407 / 37686 / 750|[来源](https://activity.hdslb.com/blackboard/maxfiles/d0f1584af802138e3e94a47e7d419635/1718720946239.zip)|
|刃|`blade`|官方活动页 CDN|`刃1.0.pmx`|22360 / 27429 / 515|[来源](https://activity.hdslb.com/blackboard/static/20230717/952f7c986d30869651e51a154c9fc2bc/SznrBfZC3U.rar)|
|萨姆|`sam`|官方活动页 CDN|`萨姆1.0.pmx`|28698 / 28884 / 194|[来源](https://activity.hdslb.com/blackboard/maxfiles/d0f1584af802138e3e94a47e7d419635/1718720946239.zip)|
|花火|`sparkle`|官方活动页 CDN|`花火3.0.pmx`|29094 / 38025 / 718|[来源](https://activity.hdslb.com/blackboard/static/20240205/9634f55137cff5d24df20d1d2d7780b9/056mDPC3Hc.zip)|
|桑博|`sampo`|社区公开镜像|`Sampo.pmx`|24249 / 29686 / 227|[来源](https://drive.google.com/drive/folders/1j5ocYy1VV65iDNPBKiVFuX8O5-HxuNIB)|
|布洛妮娅|`bronya`|官方活动页 CDN|`布洛妮娅 1.0.pmx`|30683 / 36272 / 395|[来源](https://activity.hdslb.com/blackboard/static/20230425/952f7c986d30869651e51a154c9fc2bc/YD2dl93Doi.zip)|
|星期日|`sunday`|社区公开镜像|`星穹铁道—星期日.pmx`|20957 / 34746 / 448|[来源](https://drive.google.com/drive/folders/161UQnJP1oiN8epVs24DFlt0g2UHCT4W3)|

## 官方来源链

下载 URL 取自以下 B 站官方《崩坏：星穹铁道》创作者活动页的公开模型下载配置，实际文件由 `activity.hdslb.com` 提供：

- [跃迁特别招募](https://www.bilibili.com/blackboard/activity-Hk1xELkY1x.html)：三月七、丹恒、男女开拓者，包含独立球棒、骑枪、弓箭等武器。
- [1.0 创作者激励计划](https://www.bilibili.com/blackboard/activity-DC3ncGXBYU.html)：布洛妮娅。
- [1.1 创作者激励计划](https://www.bilibili.com/blackboard/activity-NJHgRB8RXx.html)：黑塔、银狼。
- [1.2 创作者激励计划](https://www.bilibili.com/blackboard/activity-pvTPn8PGo9.html)：卡芙卡、刃。
- [1.3 创作者激励计划](https://www.bilibili.com/blackboard/activity-5hkwDIRkBv.html)：白露。
- [2.0 创作者激励计划](https://www.bilibili.com/blackboard/activity-4XFPl2h6CW.html)：花火。
- [2.1 创作者激励计划](https://www.bilibili.com/blackboard/activity-KUcTrGBIbE.html)：砂金。
- [2.2 创作者激励计划](https://www.bilibili.com/blackboard/activity-UQisbrFEze.html)：知更鸟。
- [2.3 创作者激励计划](https://www.bilibili.com/blackboard/activity-EhLrQRvd9F.html)：流萤、萨姆，外层 ZIP 包含两份内部模型 ZIP。

原档案位于 `.cache/official-models/`；部分以 `.rar` 结尾的官方文件实为 ZIP，因此按文件签名识别，刃的真 RAR 使用系统 tar 安全解包。解包时检查路径仍在目标目录内，并按 ZIP 编码标志和 GBK 恢复中文文件名。

## 四个社区存档模型

杰帕德、姬子、桑博、星期日来自 [hydratedgodzilla 的公开整理说明](https://www.reddit.com/r/HonkaiStarRail/comments/132dshx/honkai_star_rail_official_mmd_models/) 链接的 [Google Drive 存档](https://drive.google.com/drive/folders/1UZnuFJZZqiYws2geifYxAZI3a98abl6x)。上传者说明其取自星铁官方模之屋账号；文件内模型版权标识为 miHoYo，模型编辑为神帝宇或流云景。没有登录、访问私有链接或提取账号凭据。

这四份是社区保存的模型，不能把其 Google Drive 链接称为官方服务器；本次未能取得对应官方原包做逐字节哈希比对。桑博的文件和纹理名经过存档者整理，附有 `translate.txt`；姬子的 `姬子2.0.pmx` 内部名称字段遗留 `Tda式ミク・アペンド - 巻髪`，保留原状，版权与编辑者标识见原 PMX 注释。实际外观仍需要在本地渲染中核验。

[快手官方素材库公开文档](https://docs.qingque.cn/d/home/eZQC_IP9bdLf7JauYUuL0GVbk?identityId=22NZbj8fX7c) 同样列出了这四位角色；本次其静态附件下载端点返回下载链接已失效，未将失效链接冒充可用下载。

## 规则与用途

已读取模型包中原始 `使用规则.txt`，以及 PMX 内嵌注释。共同条款允许模型调整、骨骼与刚体优化、UV 重制；限制模型再次分发和商业使用，并要求避免特定不当用途。各原始规则均保留在对应模型目录，转换包 metadata 也保留原注释、源文件 SHA-256 与来源 URL。

因此，本地导入、渲染与已获授权的开发工作可以继续；带这些模型数据的 HTML、ZIP 或 EXE 不应被描述为已获权利人许可的自由分发包。软件代码的可打包能力与模型资源的再分发许可是两件独立事项。对外分享应使用获得相应许可的资源，或由使用者自行从原配布来源获取；本记录不构成新的资源授权。

## 技术接入与实际限制

本项目 Three.js 为 0.180.0，本机该版本不存在 `examples/jsm/loaders/MMDLoader.js`。Three.js [官方迁移指南](https://github.com/mrdoob/three.js/wiki/Migration-Guide) 记载 MMD 模块移除迁移。项目使用独立 PMX 解析与纹理内嵌方案，避免直接引用不存在的加载器。

```powershell
node scripts/convert-pmx.mjs "public/assets/models/gepard/杰帕德.pmx" "public/assets/models/gepard/bundle.json" --id gepard --source "https://drive.google.com/drive/folders/16GcwWJW741Nq9pvZYKQhAvQUewMJmOq3" --max-texture 512
```

已对 18 个角色解析获得非零顶点、三角面、骨骼和贴图，转换器未报告缺图。数值验证仅证明解析与素材完整性；实际显示与动作仍以浏览器渲染检查为准。当前导入器将 SDEF/QDEF 蒙皮近似为线性蒙皮，未还原原游戏材质、物理、IK 与原版战斗动作，战斗动作由项目骨骼动画驱动。

## 新增五个关卡首领

2026-09-29 已取得并转换帕姆、五个地区首领及归寂另外两相，共 8 套实际三维网格。6 套使用原游戏 FBX 转 GLB，帕姆与来古士战斗形态使用匹配 PMX；这些是公开社区存档或游戏素材目录提供的资源，不称为新的官方 MMD 配布。逐文件来源、原文件哈希、转换后哈希和限制见 [`model-expansion-bosses-pompom.json`](model-expansion-bosses-pompom.json)。19 套普通怪物与召唤物另见 [`model-expansion-monsters.json`](model-expansion-monsters.json)。

|角色/形态|目录 id|格式|三角面 / 骨骼|来源|
|---|---|---|---|---|
|帕姆|`pompom`|PMX|15266 / 302|[公开原模型镜像](https://drive.google.com/drive/folders/1MIwsoXxJzppWaULqVpGJngXWF9W231_W)|
|末日兽|`boss_doomsday`|GLB|42072 / 200|[HoyoToon 原文件目录](https://assets.hoyotoon.com/api/remote-assets?game=hsr&type=monsters&ids=2002020)|
|幻胧|`boss_phantylia`|GLB|56778 / 327|[HoyoToon 原文件目录](https://assets.hoyotoon.com/api/remote-assets?game=hsr&type=monsters&ids=8015020)|
|神主日|`boss_dominicus`|GLB|46457 / 98|[HoyoToon 原文件目录](https://assets.hoyotoon.com/api/remote-assets?game=hsr&type=monsters&ids=3025010)|
|来古士战斗形态|`boss_lycurgus`|PMX|39973 / 244|[Phoshco/hsr 战斗模型](https://github.com/Phoshco/hsr/tree/59ed5841039b7e2763cb7d2b56c11951307d6557/chars/Lygus/Lygus_boss)|
|归寂·成|`boss_guiji`|GLB|57076 / 147|[HoyoToon 原文件目录](https://assets.hoyotoon.com/api/remote-assets?game=hsr&type=monsters&ids=8015030)|
|归寂·住|`boss_guiji_existence`|GLB|54063 / 154|[HoyoToon 原文件目录](https://assets.hoyotoon.com/api/remote-assets?game=hsr&type=monsters&ids=8015040)|
|归寂·坏|`boss_guiji_decay`|GLB|53391 / 147|[HoyoToon 原文件目录](https://assets.hoyotoon.com/api/remote-assets?game=hsr&type=monsters&ids=8015050)|

末日兽在源站目录中被误归入 `Flying Sword`。采用的是该目录内 `Art_AML_Boss_00.fbx` 与 `Monster_AML_Boss_00_*` 原配贴图，而非飞剑文件；已对转换结果作正面、侧面渲染，确认其白紫色翼龙躯体、双手、长尾与翼部外形，并确认 glTF 正面轴为 `+Z`。来古士 PMX 内部名为“来古士（boss）”，不使用普通剧情 NPC；另已保留其 HoyoToon 原始 FBX。归寂为 `Art_W5_AsatPramad_00/01/02` 三个实际战斗形态，不使用归寂 NPC 冒充。

本轮保留的 154 个 HoyoToon 原文件均与公开完整 manifest 的 SHA-256 一致。FBX、材质 JSON 与原纹理未被转换覆盖。转换器使用本机 Blender 5.2.1，将材质 JSON 的确切漫反射引用绑定到同包原图，贴图缩至最大 256 像素后内嵌 GLB；6 个 GLB 的 27 张内嵌图均已解码验证，所有缓冲和纹理均无外链。三角面数量与原 FBX 一致，所有原骨骼节点保留；导出的顶点数可能因材质、法线与 UV 接缝拆分而增加。

本轮 6 份 FBX 都没有原生动画片段，导出的 `animations` 为 0，不能把运行时位移或程序动作称为原版战斗动画。Unity 专用的卡通光照、描边、Ramp、特效与物理没有由标准 glTF 完整还原，运行时材质是近似呈现，原参数另存。幻胧的渐进式 morph 几何全部保留为独立形变目标，但无原动作可还原其渐进时序；没有贴图或颜色参数的原 `Mat_FaceMask` stencil 辅助网格保留为透明几何。模型身份核验、数值完整性与游戏内最终显示验收分别记录，不互相替代。
