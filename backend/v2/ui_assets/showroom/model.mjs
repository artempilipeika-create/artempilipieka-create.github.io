/** Reader for the fixed, texture-free NMD2 GLB shipped with this page.
 * Deliberately not a user-upload/import endpoint. Reject unsupported layouts.
 */
export function readShowroomModel(buffer,THREE){
  const view=new DataView(buffer);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw Error('Invalid GLB');
  const jsonSize=view.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonSize)));
  const binOffset=28+jsonSize;
  if(view.getUint32(16,true)!==0x4e4f534a||view.getUint32(binOffset-4,true)!==0x004e4942||json.nodes.length!==1||json.meshes.length!==1||json.textures?.length)throw Error('Unsupported showroom model');
  const attribute=i=>{
    const a=json.accessors[i],b=json.bufferViews[a.bufferView],Type={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a.componentType],size={VEC3:3,SCALAR:1}[a.type];
    if(!Type||!size||a.sparse||b.byteStride||b.buffer!==0)throw Error('Unsupported attribute');
    return new THREE.BufferAttribute(new Type(buffer,binOffset+(b.byteOffset||0)+(a.byteOffset||0),a.count*size),size);
  };
  const root=new THREE.Group(),node=json.nodes[0];
  root.name=node.name;root.quaternion.fromArray(node.rotation||[0,0,0,1]);root.scale.fromArray(node.scale||[1,1,1]);root.position.fromArray(node.translation||[0,0,0]);
  for(const primitive of json.meshes[0].primitives){
    if(primitive.mode!==4)throw Error('Unsupported primitive');
    let g=new THREE.BufferGeometry();g.setAttribute('position',attribute(primitive.attributes.POSITION));g.setIndex(attribute(primitive.indices));
    if(primitive.attributes.NORMAL!==undefined)g.setAttribute('normal',attribute(primitive.attributes.NORMAL));
    else{const indexed=g;g=g.toNonIndexed();indexed.dispose();g.computeVertexNormals();}
    const src=json.materials[primitive.material],p=src.pbrMetallicRoughness;
    const material=new THREE.MeshStandardMaterial({name:src.name,color:new THREE.Color().setRGB(...p.baseColorFactor.slice(0,3),THREE.LinearSRGBColorSpace),roughness:p.roughnessFactor,metalness:p.metallicFactor,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
  root.updateMatrixWorld(true);return root;
}
