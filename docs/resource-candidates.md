# 绘本来源与选材入口

正式书目只维护MySQL。先执行 `python3 scripts/materials.py list` 排重，再核验目标书完整原文、逐页插画、来源署名及独立许可；本页是选材入口，不是可导入书目清单。

## StoryBloom

- 网站：[公开绘本馆](https://storybloom.valleylmh.vip/library)；[来源仓库](https://github.com/valleylmh/storybloom)。
- 来源证据与已制作书目：[来源说明](../content/sources/storybloom/README.md)、[逐本哈希与路径](../content/sources/storybloom/sources.json)。
- 2026-11-18核验的来源系列包括成语故事、谚语故事、西游记、好奇为什么、唐诗入画、亲子成长、城市汽车小队、日常系列。来源册数和上线情况会变化，不据历史总数选书。
- 已制作城市交通4本和亲子成长4本。后续选材优先切换系列，避免持续新增同一交通主题；当前批次为亲子成长，不新增旧4本交通书。
- 亲子成长显示名对应来源站历史路径 `/library/sanzijing/`，当前注册代码为 `src/lib/library/qinzi.ts`；城市汽车小队使用 `/library/qiche/`。系列名与路径名须分别核实。
- 上游JSON只作不可编辑来源证据，正文与对白以MySQL为准。原画校验与制作沿用 `scripts/storybloom_art.py`，不把全站批量下载当作已选材。
- 上游公开AI生成样例未列本批逐本个人作者、插画师；README仅明确MIT用于应用代码，不据此声称图文已获独立许可。逐本如实记录pending及未核实权限。

## Book Dash及其他候选

- Book Dash现有来源：[早期改绘](../content/sources/bookdash/README.md)、[开放许可原画](../content/sources/bookdash-originals/README.md)。同一故事不同版本先查库识别，不改旧业务ID为另一故事。
- African Storybook、StoryWeaver、Let’s Read仍可逐本考察；平台名称不等于逐本许可证，也不表示整本图片和可朗读原文已齐。
- 新增默认每批至少4本；优先完整叙事、适龄、图文匹配、可朗读及不同画风，不拆句或重复图片凑页数。年龄和主题使用库内现有字典。
