import type {SupabaseClient} from './types';
export type MaintenanceJob={id:string;household_id:string;removed_instances:number;paths:string[];status:'pending'|'failed'|'done';attempts:number;last_error:string|null;created_at:string};
type Result={data:unknown;error:{message:string}|null};
type Rpc=(name:string,args:Record<string,unknown>)=>PromiseLike<Result>;
async function call(client:SupabaseClient,name:string,args:Record<string,unknown>){
 const result=await (client.rpc.bind(client) as unknown as Rpc)(name,args);
 if(result.error)throw new Error(result.error.message);return result.data;
}
export async function listMaintenance(client:SupabaseClient,household:string){return await call(client,'list_maintenance',{target_household:household}) as MaintenanceJob[];}
export async function runMaintenance(client:SupabaseClient,household:string,prepare:boolean,progress:(text:string)=>void){
 if(prepare)await call(client,'prepare_maintenance',{target_household:household});
 const jobs=(await listMaintenance(client,household)).filter(j=>j.status!=='done').slice(0,20);
 for(const [index,job] of jobs.entries()){
  progress(`处理图片任务 ${index+1} / ${jobs.length}`);
  let error:string|null=null;
  try{
   if(job.household_id!==household||job.paths.some(p=>!p.startsWith(`households/${household}/`)||p.includes('..')||p.includes('\\')))throw new Error('任务路径不属于当前谷仓');
   if(job.paths.length){const result=await client.storage.from('collection-images').remove(job.paths);if(result.error)throw new Error(result.error.message);}
  }catch(e){error=e instanceof Error?e.message:'图片清理失败';}
  await call(client,'record_maintenance_attempt',{target_household:household,target_job:job.id,succeeded:error===null,error_text:error});
 }
 return listMaintenance(client,household);
}
