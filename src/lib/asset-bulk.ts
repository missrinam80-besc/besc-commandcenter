import {z} from "zod";
export const assetStatuses={planned:"Gepland",active:"In gebruik",maintenance:"Onderhoud",loaned:"Uitgeleend",retired:"Buiten gebruik",lost:"Vermist",archived:"Gearchiveerd"} as const;
export const assetBulkSchema=z.object({
 ids:z.array(z.string().uuid()).min(1).max(1000).refine(ids=>new Set(ids).size===ids.length),
 mode:z.enum(["update","archive","delete"]),
 changeLocation:z.boolean().default(false),changeStatus:z.boolean().default(false),
 location:z.string().trim().max(300).default(""),
 status:z.enum(["planned","active","maintenance","loaned","retired","lost","archived"]).optional(),
}).superRefine((value,ctx)=>{
 if(value.mode!=="update")return;
 if(!value.changeLocation&&!value.changeStatus)ctx.addIssue({code:"custom",message:"Kies locatie of status om te wijzigen."});
 if(value.changeStatus&&!value.status)ctx.addIssue({code:"custom",path:["status"],message:"Kies een status."});
});
export type AssetBulkInput=z.input<typeof assetBulkSchema>;
export type AssetListRow={id:string;name:string;asset_type:string;status:string;location:string|null;serial_number:string|null;valueLabel:string;acquiredLabel:string;ownerLabel:string;relationLabel:string;document_url:string|null};
