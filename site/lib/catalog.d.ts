export const features:Record<string,string>;
export const models:any[];
export function filterModels(list:any[],filters?:{query?:string,power?:string,range?:number,features?:string[],detailed?:boolean}):any[];
export function recommend(list:any[],preferences?:any):any;
