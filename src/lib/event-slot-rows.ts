/** Never render a partial agenda or a falsely low booking count after a query failure. */
export async function loadEventRows<T>(read:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>){
 const rows:T[]=[];for(let from=0;from<20000;from+=500){const page=await read(from,from+499);if(page.error||!page.data)return {data:null,error:page.error??Error("event_rows_unavailable")};rows.push(...page.data);if(page.data.length<500)return {data:rows,error:null};}return {data:null,error:Error("event_rows_limit")};
}
