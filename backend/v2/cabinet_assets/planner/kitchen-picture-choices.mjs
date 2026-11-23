import './choice-card-ui.js';

// The select remains the keyboard and form control. A picture chooses the same value.
export function kitchenPictureChoices(parent,select,fileFor){
 const group=document.createElement('div');
 group.className='kitchen-picture-choices';
 group.setAttribute('role','group');
 group.dataset.field=select.getAttribute('aria-label');
 group.setAttribute('aria-label','Выбор по изображению');
 for(const option of select.options){
  const file=fileFor(option.value);
  if(!file)continue;
  const button=document.createElement('button'),img=document.createElement('img'),label=document.createElement('span');
  button.type='button';button.disabled=option.disabled;
  button.setAttribute('aria-pressed',String(option.selected));
  img.src=globalThis.MF_CHOICE_CARDS.image(file,'kitchen-option-images');
  img.loading='lazy';img.decoding='async';img.alt='';
  label.textContent=option.textContent;
  button.append(img,label);
  button.onclick=()=>{
   if(select.value===option.value)return;
   const form=parent.closest('form');
   select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));
   const active=[...(form?.querySelectorAll('.kitchen-picture-choices')??[])].find(g=>g.dataset.field===group.dataset.field);
   active?.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
  };
  group.append(button);
 }
 if(group.childElementCount)parent.append(group);
}
