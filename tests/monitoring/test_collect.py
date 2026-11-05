import importlib.util,json,unittest
from pathlib import Path
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('collect',Path(__file__).resolve().parents[2]/'ops/monitoring/collect.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Sensors(unittest.TestCase):
 def setUp(self):
  self.config={'organization_id':'999b6af9-479c-4082-b9d8-fa0a78aefac5','target':'web','containers':{'container_cc':'cc','container_website':'website','container_caddy':'proxy'},'http':{'http_cc':{'container':'cc','path':'/login'},'http_website':{'container':'website','path':'/api/health'}},'uploader_container':'cc'}
  self.disk=SimpleNamespace(f_bavail=2000000,f_frsize=1024,f_blocks=10000000,f_bfree=2000000,f_files=100000,f_favail=80000)
  self.memory='MemTotal: 500000 kB\nMemAvailable: 200000 kB\nSwapTotal: 100000 kB\nSwapFree: 90000 kB\n'
  self.state={'running':True,'health':'healthy','oom':False,'log_type':'json-file','log_size':'10m','log_files':'3'}
  self.http='200';self.failed='';self.journal='SystemMaxUse=256M';self.ntp='yes';self.engine=True
 def run_command(self,args,timeout=8):
  if args[:2]==['docker','inspect']:return json.dumps(self.state) if self.engine else None
  if args[:2]==['docker','exec']:return self.http
  if args[0]=='systemctl':return self.failed
  if args[0]=='timedatectl':return self.ntp
  if args[0]=='du':return '25600 /var/log/journal'
  if args[0]=='systemd-analyze':return self.journal
  raise AssertionError(args)
 def sample(self):return m.collect(self.config,self.run_command,lambda _:self.disk,lambda _:self.memory)
 def levels(self):return {v['code']:v['level'] for v in self.sample()['checks']}
 def test_healthy_sensors_are_numeric_and_bounded(self):
  value=self.sample();self.assertTrue(all(isinstance(v,(int,float)) for v in value['metrics'].values()));self.assertTrue(all(v=='ok' for v in self.levels().values()));self.assertEqual(value['metrics']['containers_running'],3)
 def test_capacity_thresholds_warn_and_stop_before_full_disk(self):
  self.disk.f_bavail=900000;self.assertEqual(self.levels()['disk'],'warning');self.disk.f_bavail=400000;self.assertEqual(self.levels()['disk'],'critical')
 def test_memory_pressure_and_inode_exhaustion(self):
  self.memory=self.memory.replace('200000','60000');self.disk.f_favail=1000;self.assertEqual(self.levels()['memory'],'critical');self.assertEqual(self.levels()['inodes'],'critical')
 def test_missing_engine_and_failed_http_cannot_appear_healthy(self):
  self.engine=False;self.http=None;v=self.levels();self.assertEqual(v['docker'],'critical');self.assertEqual(v['container_cc'],'critical');self.assertEqual(v['http_website'],'critical')
 def test_unbounded_logs_failed_services_and_missing_clock_are_visible(self):
  self.state['log_size']='';self.journal='';self.failed='broken.service loaded failed';self.ntp=None;v=self.levels();self.assertEqual(v['log_rotation'],'warning');self.assertEqual(v['journal_limit'],'warning');self.assertEqual(v['systemd'],'warning');self.assertEqual(v['clock_sync'],'warning')
 def test_healthy_container_without_docker_healthcheck_is_not_invented_as_failed(self):
  self.state['health']=None;self.assertEqual(self.levels()['container_caddy'],'ok')
 def test_https_failure_is_visible_even_with_healthy_containers(self):
  self.config['https']={'https_cc':'https://cc-dev.belgianstreamerscommunity.be/login'}
  result=m.collect(self.config,self.run_command,lambda _:self.disk,lambda _:self.memory,http_get=lambda _:None)
  self.assertEqual(next(c['level'] for c in result['checks'] if c['code']=='https_cc'),'critical')
 def test_configuration_cannot_inject_shell_commands_or_probe_arbitrary_paths(self):
  m.validate_config(self.config);self.config['containers']['container_cc']='cc; echo SECRET'
  with self.assertRaises(ValueError):m.validate_config(self.config)
  self.config['containers']['container_cc']='cc';self.config['http']['http_cc']['path']='/api/private'
  with self.assertRaises(ValueError):m.validate_config(self.config)
if __name__=='__main__':unittest.main()
