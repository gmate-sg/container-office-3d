import fs from 'node:fs/promises';
const source=JSON.parse(await fs.readFile('../../work/model_revision/drawing_systems.json','utf8'));
const notes={notes:source.notes,legends:source.legends,installedCounts:{LED:25,smoke_detector:14,emergency_luminaire:7,emergency_exit:8,sounder_beacon:2,socket:6,switch:8,outdoor_luminaire:1},dimensionNotes:[
 {title:'模块尺寸',text:'模块名义长度 12192 mm、宽度 2438 mm。方案采用两层，每层高度 2896 mm。'},
 {title:'整体与庭院',text:'建筑横向模块宽 12192 mm，纵向总体 14630 mm（2438 + 12192，推算）；两侧模块之间净名义间距 7316 mm（12192 − 2 × 2438，推算）。'},
 {title:'材料规格',text:'原图说明：75 mm 岩棉夹芯墙板、28 mm 集装箱专用木地板及环氧地坪饰面。'},
 {title:'原图层高差异',text:'规格文字列出 2591 mm，立面标注 2896 mm；本方案按立面采用 2896 mm，原文保留在技术说明中供对照。'},
 {title:'门窗与设备定位',text:'门窗位置依据平面图；一层窗在平面与部分立面存在表达差异，本模型按平面恢复。未单独标注的门窗偏移、家具和设备型号尺寸为表现示意。'},
 {title:'灯具及消防设备',text:'图中明确表达 24 盏室内 LED、1 盏庭院灯、14 个烟感及 7 组双头应急灯。EXIT、控制器、开关、插座等按使用关系合理布置，原图未定位状态仍保留在说明中。'}
]};
await fs.writeFile('public/assets/spec-notes.json',JSON.stringify(notes,null,2));console.log('Bilingual PDF notes and8legendtypes prepared.');
