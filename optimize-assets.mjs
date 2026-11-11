import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const root = path.resolve('public/assets');
const input = process.argv[2] || path.join(root, 'model.glb');
const output = path.join(root, 'space.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
const doc = await io.read(input);
await doc.transform(dedup(), weld(), prune());
for(const texture of doc.getRoot().listTextures()) {
  const bytes=texture.getImage();if(!bytes)continue;
  const packed=await sharp(Buffer.from(bytes)).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:86}).toBuffer();
  texture.setImage(new Uint8Array(packed)).setMimeType('image/webp');
}
doc.createExtension(EXTTextureWebP).setRequired(true);
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high'}));
await io.write(output,doc);
const data=JSON.parse(await fs.readFile(path.join(root,'scene-data.json'),'utf8'));
data.model='space.glb';
data.optimization={geometry:'Meshopt',textures:'WebP, maximum 1024 px',bytes:(await fs.stat(output)).size};
await fs.writeFile(path.join(root,'scene-data.json'),JSON.stringify(data,null,2));
console.log(JSON.stringify({inputBytes:(await fs.stat(input)).size,outputBytes:(await fs.stat(output)).size,meshes:doc.getRoot().listMeshes().length,materials:doc.getRoot().listMaterials().length}));
