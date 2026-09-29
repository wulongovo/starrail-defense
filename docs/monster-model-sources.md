# 普通怪物真实 3D 来源与验证

这批资源来自 [HoyoToon 的公开游戏资产目录](https://assets.hoyotoon.com/?game=hsr&type=monsters)，属于第三方保存的游戏原始 FBX、材质 JSON 与贴图，不是官方 MMD 配布，也不是程序生成或以可玩角色替代的模型。模型及游戏内容版权仍属于 miHoYo / HoYoverse。公开可下载不等同允许自由再分发；当前用于本地预览，未确认对外发行授权。

网站浏览器使用的公开目录接口 `/api/catalog?game=hsr&type=monsters` 返回 189 个条目；每个实际目标通过 `/api/remote-assets?game=hsr&type=monsters&ids=<monsterId>` 取得精确文件清单，再使用清单中的公开 `downloadUrl`。请求没有使用账户、私人凭据或绕过验证。只取本作匹配的怪物目录，未下载无关角色、全量游戏客户端或整包场景。

完整逐文件来源、大小、SHA-256、精确怪物 ID、源模型名与转换结果见 `model-expansion-monsters.json`。原始文件保留在 `public/assets/models/<id>/source/Default/`，同级 `source/SOURCE.json` 保留下载证据；`.cache/monster-models/<id>-source-snapshot.zip` 是本地把这些原件无损归档形成的快照，明确不是声称由官方发布的 ZIP。

转换使用 `scripts/convert-fbx-blender.py`，输出 `wulong-glb-bundle-v1`。验证原始 FBX 哈希不变、三角面与骨骼保留、材质 JSON 精确引用的漫反射贴图全部存在、GLB 内嵌贴图和缓冲区。贴图最大边缩至 256；游戏的专用光照、描边、阴影渐变等 Shader 由标准 glTF 材质近似，并未声称画面完全等同原游戏。源 FBX 没有动画时保持无原版动画，不伪称下载到完整动作库。浏览器外观、朝向与动作验收由主任务单独记录。

`enemy_retainer` 曾使用同人通称“演算眷属”。主任务核对来古士敌人资料的召唤列表后，选择其中确有对应的“天谴斗士 / Furiae Warrior”（4012010，`Art_W4_Strongman_00`）并保留旧 gameplay ID；这不是拿黑塔错误型号或其他模型顶替该称呼。

早期排查的官方活动角色索引、Phoshco HSR 查看器、SR-Model-Importer-Assets 和 HoyoToon 旧 GitHub 仓库未包含这套普通怪物。HoyoToon 新站提供了匹配的原始几何。Open3DLab 的人机挑战未绕过；Thunderstore 等网站的角色与首领条目没有计入这 19 个普通/召唤怪物结果。
