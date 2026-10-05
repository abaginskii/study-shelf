export type Kind='text'|'pdf'|'image'|'audio'|'video';
export type Question={question:string;answer:string;sourceQuote:string};
export type MaterialCard={id:string;title:string;subject:string;kind:Kind;createdAt:string;updatedAt:string;status:'inbox'|'ready';excerpt:string;hasFile:boolean;filename?:string;size?:number;revision?:number};
export type Material=MaterialCard&{text:string;summary:string;terms:string[];questions:Question[];mime?:string;size?:number;warning?:string;sourceVersion:number;summaryVersion?:number;aiGenerated?:boolean;filePath?:string};
export type Topic={id:string;title:string;body:string;materialId:string;createdAt:string};
export type Library={materials:MaterialCard[];topics:Topic[];reviews:number;uploads?:{pathname:string;size:number;createdAt:number}[];aiUsage:{day:string;count:number}};
export type User={id:string;username:string;passwordHash:string;recoveryHash:string;createdAt:string;version:number};
export const emptyLibrary=():Library=>({materials:[],topics:[],reviews:0,aiUsage:{day:'',count:0}});
