const Joi=require('joi');
const IBAN=require('iban');
function luhn(value) {let sum=0;let twice=false;for(let i=value.length-1;i>=0;i--){let n=Number(value[i]);if(twice){n*=2;if(n>9)n-=9;}sum+=n;twice=!twice;}return sum%10===0;}
const iban=Joi.string().trim().uppercase().replace(/\s/g,'').pattern(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/).max(34).custom((value,helpers)=>IBAN.isValid(value)?value:helpers.error('any.invalid')).required();
const cardNumber=Joi.string().replace(/\s/g,'').pattern(/^[0-9]{13,19}$/).custom((value,helpers)=>luhn(value)?value:helpers.error('any.invalid'));
const expiry=Joi.string().pattern(/^(0[1-9]|1[0-2])\/20[0-9]{2}$/).custom((value,helpers)=>{const [month,year]=value.split('/').map(Number);return new Date(year,month,1).getTime()>Date.now()?value:helpers.error('any.invalid');});
module.exports={iban,cardNumber,expiry,expiryFormat:Joi.string().pattern(/^(0[1-9]|1[0-2])\/20[0-9]{2}$/)};
