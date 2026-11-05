#!/usr/bin/env python3
"""Bounded, read-only host sensors. Only allowlisted numeric metrics and status codes leave the host."""
import argparse,json,os,re,subprocess,sys,tempfile,urllib.request,urllib.error
from datetime import datetime,timezone
from pathlib import Path

def command(args,timeout=8):
 try:
  r=subprocess.run(args,capture_output=True,text=True,timeout=timeout,check=False)
  return r.stdout.strip() if r.returncode==0 else None
 except (OSError,subprocess.TimeoutExpired):return None

def https_status(url):
 try:
  with urllib.request.urlopen(url,timeout=8) as response:return response.status
 except (OSError,urllib.error.URLError):return None

def severity(value,warn,critical,inverse=False):
 if inverse:return 'critical' if value>=critical else 'warning' if value>=warn else 'ok'
 return 'critical' if value<critical else 'warning' if value<warn else 'ok'

def collect(config,run=command,statvfs=None,read_text=lambda p:Path(p).read_text(),http_get=https_status):
 statvfs=statvfs or os.statvfs
 metrics={};checks=[]
 def add(code,level):checks.append({'code':code,'level':level})
 disk=statvfs('/')
 free=disk.f_bavail*disk.f_frsize//1024;total=disk.f_blocks*disk.f_frsize//1024;used=(disk.f_blocks-disk.f_bfree)*disk.f_frsize//1024
 percent=round(100*used/max(1,used+free),2);inodes=round(100*(disk.f_files-disk.f_favail)/max(1,disk.f_files),2)
 metrics.update(disk_total_kib=total,disk_free_kib=free,disk_used_pct=percent,inode_used_pct=inodes)
 low=severity(free,1048576,524288);high=severity(percent,85,95,True);rank={'ok':0,'warning':1,'critical':2}
 add('disk',max([low,high],key=lambda v:rank[v]));add('inodes',severity(inodes,85,95,True))
 memory={m.group(1):int(m.group(2)) for m in re.finditer(r'^(\w+):\s+(\d+)',read_text('/proc/meminfo'),re.M)}
 metrics.update(mem_total_kib=memory['MemTotal'],mem_available_kib=memory['MemAvailable'],swap_used_kib=memory.get('SwapTotal',0)-memory.get('SwapFree',0))
 add('memory',severity(memory['MemAvailable'],131072,65536))
 fmt='{"running":{{.State.Running}},"health":{{if .State.Health}}"{{.State.Health.Status}}"{{else}}null{{end}},"oom":{{.State.OOMKilled}},"log_type":"{{.HostConfig.LogConfig.Type}}","log_size":"{{index .HostConfig.LogConfig.Config "max-size"}}","log_files":"{{index .HostConfig.LogConfig.Config "max-file"}}"}'
 running=0;bounded=True;any_response=False
 for code,name in config['containers'].items():
  raw=run(['docker','inspect',name,'--format',fmt])
  try:state=json.loads(raw) if raw else None
  except (ValueError,TypeError):state=None
  if state:
   any_response=True;running+=int(state['running'])
   okay=state['running'] and state['health'] in [None,'healthy'] and not state['oom']
   bounded=bounded and (state['log_type']=='local' or(state['log_type']=='json-file' and bool(re.fullmatch(r'[1-9]\d*[kmg]?',state['log_size'].lower())) and state['log_files'].isdigit() and int(state['log_files'])>0))
  else:okay=False;bounded=False
  add(code,'ok' if okay else 'critical')
 metrics.update(containers_running=running,expected_containers=len(config['containers']))
 add('docker','ok' if any_response else 'critical');add('log_rotation','ok' if bounded else 'warning')
 for code,item in config.get('http',{}).items():
  js="fetch('http://127.0.0.1:3000'+"+json.dumps(item['path'])+",{redirect:'manual',signal:AbortSignal.timeout(5000)}).then(async r=>{if(r.body)await r.body.cancel();console.log(r.status)}).catch(()=>process.exit(1))"
  status=run(['docker','exec',item['container'],'node','-e',js])
  add(code,'ok' if status=='200' else 'critical')
 for code,url in config.get('https',{}).items():add(code,'ok' if http_get(url)==200 else 'critical')
 failed=run(['systemctl','--failed','--no-legend','--plain','--no-pager'])
 metrics['failed_units']=len(failed.splitlines()) if failed else 0
 add('systemd','warning' if failed is None or metrics['failed_units'] else 'ok')
 add('clock_sync','ok' if run(['timedatectl','show','-p','NTPSynchronized','--value'])=='yes' else 'warning')
 journal=run(['du','-sk','/var/log/journal'])
 if journal and journal.split()[0].isdigit():metrics['journal_bytes']=int(journal.split()[0])*1024
 settings=run(['systemd-analyze','cat-config','systemd/journald.conf']) or ''
 limits=re.findall(r'^SystemMaxUse=([^\n#]+)',settings,re.M)
 add('journal_limit','ok' if limits and re.fullmatch(r'[1-9]\d*[KMGTP]?',limits[-1].strip()) else 'warning')
 return {'metrics':metrics,'checks':checks}

def validate_config(c):
 import uuid
 uuid.UUID(c['organization_id'])
 if c['target'] not in ['web','bot']:raise ValueError('invalid_target')
 allowed={'container_cc','container_website','container_caddy','container_bot'}
 if not c['containers'] or set(c['containers'])-allowed:raise ValueError('invalid_containers')
 for name in c['containers'].values():
  if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,100}',name):raise ValueError('invalid_container_name')
 for code,item in c.get('http',{}).items():
  if code not in ['http_cc','http_website'] or item['container'] not in c['containers'].values() or item['path'] not in ['/login','/api/health']:raise ValueError('invalid_http_probe')
 if c['target']=='web' and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,100}',c['uploader_container']):raise ValueError('invalid_uploader')
 for code,url in c.get('https',{}).items():
  if {'https_cc':'https://cc-dev.belgianstreamerscommunity.be/login','https_website':'https://website-dev.belgianstreamerscommunity.be/login'}.get(code)!=url:raise ValueError('invalid_https_probe')
 if c.get('bot_probe'):
  import ipaddress
  ipaddress.ip_address(c['bot_probe']['host'])
  if c['bot_probe'].get('identity')!='/var/lib/besc-operations/ssh/identity' or c['bot_probe'].get('known_hosts')!='/var/lib/besc-operations/ssh/known_hosts':raise ValueError('invalid_probe_key_path')
 return c

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--config',default='/etc/besc/operations.json');parser.add_argument('--local-only',action='store_true');parser.add_argument('--emit-only',action='store_true');args=parser.parse_args()
 config=validate_config(json.loads(Path(args.config).read_text()))
 packet={'organization_id':config['organization_id'],'target':config['target'],'observed_at':datetime.now(timezone.utc).isoformat(),'snapshot':collect(config)}
 if args.emit_only:
  print(json.dumps(packet));return
 if config.get('bot_probe'):
  probe=config['bot_probe']
  raw=command(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=5','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+probe['known_hosts'],'-i',probe['identity'],'root@'+probe['host'],'probe'],timeout=30)
  try:
   other=json.loads(raw) if raw and len(raw)<20000 else None
   if not other or other.get('target')!='bot' or other.get('organization_id')!=config['organization_id']:raise ValueError('invalid_bot_probe')
   packet['bot']=other
  except (ValueError,TypeError):
   packet['bot']={'target':'bot','organization_id':config['organization_id'],'observed_at':packet['observed_at'],'snapshot':{'metrics':{},'checks':[{'code':'probe','level':'critical'}]}}
 state=Path('/var/lib/besc-operations');state.mkdir(mode=0o700,parents=True,exist_ok=True)
 fd,name=tempfile.mkstemp(prefix='.snapshot-',dir=state)
 try:
  with os.fdopen(fd,'w') as stream:json.dump(packet,stream)
  os.chmod(name,0o600);os.replace(name,state/'latest.json')
 finally:
  if os.path.exists(name):os.unlink(name)
 print(json.dumps({'target':packet['target'],'observed_at':packet['observed_at'],'alerts':[c for c in packet['snapshot']['checks'] if c['level']!='ok']}),flush=True)
 if args.local_only:return
 upload=Path(__file__).with_name('upload.cjs').read_text()
 result=subprocess.run(['docker','exec','-i',config['uploader_container'],'node','-e',upload],input=json.dumps(packet),capture_output=True,text=True,timeout=30)
 if result.returncode:print('OP01: upload mislukt; lokale meting bewaard.',file=sys.stderr);raise SystemExit(1)
 print(result.stdout.strip())
if __name__=='__main__':
 try:main()
 except (OSError,ValueError,KeyError,subprocess.TimeoutExpired):
  print('OP01: meting niet afgerond; configuratie, toegang of afhankelijkheid ontbreekt.',file=sys.stderr);raise SystemExit(1)
