import Link from 'next/link';
import '../rewards.css';
import {redirect} from 'next/navigation';
import {z} from 'zod';
import {AppShell} from '@/components/app-shell';
import {requireActiveMembership} from '@/lib/auth-context';
import {hasPermission} from '@/lib/permissions';
import {saveEarning} from './actions';
export const dynamic='force-dynamic';
const rule=z.object({kind:z.string(),version:z.number(),enabled:z.boolean(),xp:z.number(),bucks:z.number(),daily_xp:z.number(),daily_bucks:z.number(),cooldown_seconds:z.number(),guild_id:z.string().optional(),broadcaster_id:z.string().optional(),minimum_bits:z.number().optional()});
function Activation({item}:{item:z.infer<typeof rule>}){return <form className="reward-form" action={saveEarning}>
 <input type="hidden" name="op" value={item.guild_id?'discord_activation':'twitch_activation'}/>
 <input type="hidden" name={item.guild_id?'guild_id':'broadcaster_id'} value={item.guild_id??item.broadcaster_id}/>
 <input type="hidden" name="kind" value={item.kind}/><input type="hidden" name="version" value={item.version}/><input type="hidden" name="enabled" value={String(!item.enabled)}/>
 <label>Reden en vastgelegde goedkeuring<input name="reason" required maxLength={1000}/></label>
 <button className="secondary">{item.enabled?'Regel uitschakelen':'Deze regel goedkeuren en inschakelen'}</button></form>;}
function TwitchForm({item}:{item?:z.infer<typeof rule>}){return (<details><summary>{item?"Twitch-regel bewerken (schakelt uit)":"Nieuwe Twitch-regel als concept voorbereiden"}</summary><form className="reward-form" action={saveEarning}>
 <input type="hidden" name="op" value="twitch_save"/><input type="hidden" name="version" value={item?.version??0}/>
 <label>Numeriek Twitch-kanaal-ID<input name="broadcaster_id" defaultValue={item?.broadcaster_id} readOnly={Boolean(item)} required pattern="[1-9][0-9]{0,19}"/></label>
 <label>Event<select name="kind" defaultValue={item?.kind}>{item?<option value={item.kind}>{item.kind}</option>:<><option value="follow">Follow</option><option value="cheer">Cheer</option></>}</select></label>
 {['xp','bucks','daily_xp','daily_bucks','cooldown_seconds','minimum_bits'].map(name=><label key={name}>{({xp:'XP per event',bucks:'Bucks per event',daily_xp:'Daglimiet XP',daily_bucks:'Daglimiet Bucks',cooldown_seconds:'Wachttijd in seconden',minimum_bits:'Minimum Bits per cheer'} as Record<string,string>)[name]}<input name={name} defaultValue={item?.[name as "xp"|"bucks"|"daily_xp"|"daily_bucks"|"cooldown_seconds"|"minimum_bits"]} type="number" min={name==='cooldown_seconds'?60:name==='minimum_bits'?1:0} max={name==='xp'||name==='bucks'?100000:name==='cooldown_seconds'?86400:1000000} required/></label>)}
 <label>Onderbouwing<input name="reason" required maxLength={1000}/></label><button className="secondary">Uitgeschakeld concept opslaan</button></form></details>);}
export default async function Earning({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {supabase,membership}=await requireActiveMembership();if(!hasPermission(membership,'manageRewards'))redirect('/app/bucks?fout=rewards_forbidden');
 const params=await searchParams;const enabled=process.env.BESC_REWARDS_EARNING_ADMIN_ENABLED==='true';
 const result=enabled?await supabase.rpc('re02_admin',{o:membership.organization_id,op:'state'}):null;
 const state=z.object({discord:z.array(rule),twitch:z.array(rule)}).safeParse(result?.data);
 return <AppShell active="BESC Bucks en XP"><header className="topbar"><h1>Verdienregels en broncontrole</h1></header><div className="module-body">
 <Link href="/app/bucks?tab=regels">Discordregels bewerken</Link>
 <p>Een opgeslagen regel is een uitgeschakeld concept. Goedkeuring geldt alleen voor de getoonde versie. Bewerken schakelt de regel opnieuw uit.</p>
 <p>Automatisch verdienen: {process.env.BESC_REWARDS_ACTIVITY_ENABLED==='true'?'aan':'uit'}. Geverifieerde Twitch-events: {process.env.BESC_REWARDS_TWITCH_VERIFIED_ENABLED==='true'?'aan':'uit'}.</p>
 {params.fout&&<p role="alert">De wijziging kon niet worden bevestigd. Controleer de actuele regels.</p>}{params.opgeslagen&&<p role="status">De wijziging is opgeslagen.</p>}
 {!enabled?<p>Het beheer van verdienregels staat uit.</p>:!state.success?<p>De actuele regels konden niet worden geladen.</p>:<>
 <section className="panel"><h2>Discord</h2>{state.data.discord.length===0&&<p>Er zijn nog geen regels vastgelegd.</p>}{state.data.discord.map(item=><article key={item.guild_id+item.kind}><h3>{item.guild_id} · {item.kind} · versie {item.version}</h3><p>{item.xp} XP en {item.bucks} Bucks per event; daglimiet {item.daily_xp} XP / {item.daily_bucks} Bucks; wachttijd {item.cooldown_seconds} seconden. {item.enabled?'Ingeschakeld':'Uitgeschakeld'}</p><Activation item={item}/></article>)}</section>
 <section className="panel"><h2>Twitch</h2><p>Alleen rechtstreeks door Twitch ondertekende follow- en cheer-events komen in aanmerking. Een follow wordt maximaal eenmaal per Twitch-account en kanaal beloond. Cheers krijgen een vast bedrag per geschikt event; Bits worden niet omgerekend naar geld. Een actuele, unieke Twitch- én Discordkoppeling blijft vereist.</p>
 {state.data.twitch.map(item=><article key={item.broadcaster_id+item.kind}><h3>{item.broadcaster_id} · {item.kind} · versie {item.version}</h3><p>{item.xp} XP / {item.bucks} Bucks; daglimiet {item.daily_xp} XP / {item.daily_bucks} Bucks; wachttijd {item.cooldown_seconds} seconden; minimum {item.minimum_bits} Bits bij cheers. {item.enabled?'Ingeschakeld':'Uitgeschakeld'}</p><Activation item={item}/><TwitchForm item={item}/></article>)}
 <TwitchForm/></section>
 </>}
 </div></AppShell>;
}
