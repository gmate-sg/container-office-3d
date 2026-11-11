import sharp from 'sharp';
import path from 'node:path';
const base=path.resolve('..');
for(const [name,file] of [['exterior','实景_01_建筑外观.png'],['courtyard','实景_02_庭院正面.png'],['office','实景_03_办公区.png'],['meeting','实景_04_会议室.png'],['storage','实景_05_储藏室.png'],['locker','实景_06_更衣室.png'],['safety','实景_07_应急灯与出口标识.png']]) {
  await sharp(path.join(base,file)).webp({quality:92}).toFile(`public/assets/${name}.webp`);
}
console.log('7 latest native rendered views prepared at2560x1440.');
