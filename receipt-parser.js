/* Parse receipt blocks, keeping codes and discounts separate from product names. */
(function(root){
 const number=s=>Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s);
 const amounts=s=>[...s.matchAll(/\d+(?:\.\d{3})*,\d{2}(?!\d)|\d+\.\d{2}(?!\d)/g)].map(m=>({value:number(m[0]),index:m.index}));
 function parseReceipt(text){
  const result=[];let pending=null;
  const clean=s=>s.replace(/^(?:\d+\s+)+/,'').trim();
  const quantity=/(?<![\d.,])(\d+(?:[.,]\d{1,6})?)\s*(UNID|UND|UN|KG|ML|LT|G|L)\b\s*[xX×*]\s*/i;
  const spaced=/(\d+(?:[.,]\d{1,3})?)\s+(UNID|UND|UN|KG|ML|LT|G|L)\b/i;
  const incomplete=()=>{if(pending?.code)result.push({...pending,q:1,u:'un',p:null,discount:0,note:'Quantidade e preço não encontrados. Confira na foto.'});pending=null;};
  for(let line of text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
   line=line.replace(/(\d)\s*K[6Gg]\b(?=\s*[xX×*])/g,'$1KG');
   const plain=line.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
   const discount=plain.match(/^[dp]esconto\s+no\s+ite[mn]\s+(\d+)/i);
   if(discount){const exact=result.findLast(i=>Number(i.itemNumber)===Number(discount[1]));const item=exact||result.at(-1);const values=amounts(line.replace(/(\d):(\d{2})\b/g,'$1,$2'));if(item){item.discount=values.length?values.at(-1).value:null;item.source+='\n'+line;if(!exact||!values.length)item.note+=' Desconto ou número do item incerto: confira na foto.';}continue;}
   if(/^valor\s+total/i.test(plain)){const values=amounts(line);if(values.length)result.receiptTotal=values.at(-1).value;}
   if(/\b(total|subtotal|troco|desconto|acrescimo|pagamento|dinheiro|cartao|credito|debito|pix|tributos|impostos|cnpj|cpf|consumidor|chave|protocolo|autorizacao|endereco|telefone|obrigado|operador|caixa)\b/i.test(plain)||/\b(descricao|codigo|vl\.?\s*unit|qtd|quantidade)\b/i.test(plain)){incomplete();continue;}
   const header=line.match(/^(\d{1,4})\s+(\d{6,14})\s+(.+)$/);
   const qty=line.match(quantity)||(!header&&line.match(spaced));
   if(header&&!qty){incomplete();pending={itemNumber:header[1],code:header[2],name:header[3],source:line};continue;}
   const prices=amounts(qty?line.slice(qty.index+qty[0].length):line);
   if(!prices.length){if(pending?.code){pending.name+=' '+line;pending.source+='\n'+line;}else if(/[a-zà-ú]{2}/i.test(line))pending={name:clean(line),source:line};continue;}
   let name=clean(line.slice(0,qty?qty.index:prices[0].index).replace(/R\$\s*$/i,''));
   const base=header?{itemNumber:header[1],code:header[2]}:{};
   if(pending&&(!name||!/[a-zà-ú]{2}/i.test(name)))Object.assign(base,pending);
   name=base.name||name;if(!name||!/[a-zà-ú]{2}/i.test(name))continue;
   let q=qty?number(qty[1]):1;const raw=qty?qty[2].toUpperCase():'UN';const scale=['G','ML'].includes(raw)?.001:1;q*=scale;
   const u=['KG','G'].includes(raw)?'kg':['L','LT','ML'].includes(raw)?'L':'un';
   const p=qty?prices[0].value/scale:prices.at(-1).value;
   if(!Number.isFinite(q)||q<=0)continue;
   result.push({...base,name:name.replace(/\s{3,}.*$/,'').slice(0,90),q,u,p,discount:0,printedTotal:prices.length>1?prices.at(-1).value:null,source:(base.source?base.source+'\n':'')+line,note:qty?('Confira quantidade, preço unitário e desconto com a foto.'+(prices.length>1 && Math.abs(Math.round(p*100*q)-Math.round(prices.at(-1).value*100))>1 ? ' Quantidade ou preço não confere com o total impresso!' : '')):'Quantidade presumida: 1. Confira na foto.'});pending=null;
  }
  incomplete();return result;
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={parseReceipt};else root.parseReceipt=parseReceipt;
})(typeof window!=='undefined'?window:globalThis);
