# 源码仓库与本地素材

本公开仓库保存 wulong 的塔防代码、测试、素材导入工具和来源记录。`public/assets/`、`dist/`、`release/`、缓存、截图与抓取的第三方网页不提交。下载仓库不等于下载完整游戏。

## 开发

需要 Node.js 20 或更新版本。在仓库目录执行：

```powershell
npm ci
npm test
```

无素材时，逻辑与合成格式测试仍能运行，依赖真实模型文件的验证会明确跳过。浏览器全模型验收需要完整本地资源。文档中的 92 张角色卡、122 个模型包和历史验收结果描述开发机器的素材版本，不代表资源已随 Git 仓库提供。

## 恢复本地素材

已有完整项目的用户可把自己的资源放到以下位置，文件不会被 Git 跟踪：

```text
public/assets/characters/<游戏角色或怪物ID>.webp
public/assets/models/<游戏角色或怪物ID>/bundle.json
```

图片也支持 PNG/JPEG。模型包支持 `wulong-pmx-bundle-v1` 和 `wulong-glb-bundle-v1`，须内含对应模型数据和贴图。ID 与来源参考 `docs/model-coverage.json`、`docs/enemy-model-coverage.json` 及 `docs/model-expansion-*.json`。这些清单是来源记录，不是素材本身，也不是新的分发授权。

有原始 PMX 时可参考 `scripts/convert-pmx.mjs`；原始 FBX、材质 JSON 和贴图可参考 `scripts/convert-fbx-blender.py`。后者需自行安装 Blender；批量脚本中的本机 Blender 路径应先调整。没有材质或模型时不要把其他角色替换进去冒称原模型。

素材就绪后运行：

```powershell
npm run dev
# 浏览器打开 http://127.0.0.1:4178

# 生成本机完整 HTML 和离线预览 ZIP
npm run package
```

缺失素材时可构建源码界面，但不能呈现文档中的完整 3D 画面。构建会重新生成素材覆盖报告；不要把无素材环境生成的空覆盖报告误当成完整版本验收。

## 来源和使用范围

模型、图片、角色与世界观归原权利人所有。本仓库不代表官方作品，未声明取得公开分发第三方素材的许可。部分本地模型原规约写有“请勿二次配布”，所以不随此公开仓库上传。来源与限制见 `official-model-research.md` 和 `monster-model-sources.md`。完整本地包不上传 GitHub Releases，也不在本次操作中部署 GitHub Pages。
