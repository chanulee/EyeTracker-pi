import plistlib
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from exhibition.autostart import agent_spec,manage,deploy,LABEL


class AutostartCheck(unittest.TestCase):
    def test_agent_arguments_paths_and_persistence(self):
        with tempfile.TemporaryDirectory(prefix='Eye test ') as directory:
            root=Path(directory).resolve()
            spec=plistlib.loads(plistlib.dumps(agent_spec(root,'pupil')))
            self.assertEqual(spec['ProgramArguments'],['/usr/bin/caffeinate','-di','/bin/bash',str(root/'start-pupil.sh'),'--no-open'])
            self.assertTrue(spec['RunAtLoad'] and spec['KeepAlive'])
            self.assertEqual(spec['EnvironmentVariables']['EYE_OPEN_FRONTEND'],'1')
            self.assertIn(str(root),spec['StandardErrorPath'])
            self.assertEqual(agent_spec(root,'orlosky')['ProgramArguments'][3],str(root/'start-mac.sh'))

    def test_install_update_and_stop_keep_settings_and_plist(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'repo';home=Path(directory)/'home'
            python=root/'.venv-pupil'/'bin'/'python';python.parent.mkdir(parents=True);python.touch()
            config=root/'exhibition'/'mac-config.json';config.parent.mkdir();config.write_text('keep settings')
            for name in ('start-mac.sh','start-pupil.sh'):(root/name).touch()
            calls=[];loaded=False
            def ctl(*args,**options):
                nonlocal loaded
                calls.append(args)
                if args[0]=='print':return subprocess.CompletedProcess(args,0 if loaded else 1,stdout='state = running\npid = 100\n',stderr='')
                if args[0]=='bootstrap':loaded=True
                if args[0]=='bootout':loaded=False
                return subprocess.CompletedProcess(args,0,stdout='',stderr='')
            with patch('exhibition.autostart.sys.platform','darwin'),patch('exhibition.autostart.Path.home',return_value=home), \
                 patch('exhibition.autostart.launchctl',side_effect=ctl),patch('exhibition.autostart.subprocess.run'):
                manage('install',root=root)
                path=home/'Library'/'LaunchAgents'/f'{LABEL}.plist'
                self.assertTrue(path.exists())
                self.assertTrue(loaded)
                manage('install',root=root)
                manage('stop',root=root)
                self.assertFalse(loaded)
                self.assertTrue(path.exists())
                manage('start',root=root)
                self.assertTrue(loaded)
                manage('restart',root=root)
                self.assertTrue(any(call[0]=='kickstart' for call in calls))
                self.assertEqual(config.read_text(),'keep settings')
                manage('remove',root=root)
                self.assertFalse(path.exists())
                self.assertFalse(loaded)

    def test_deployment_updates_code_but_keeps_live_config(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'repo';destination=Path(directory)/'installed'
            (source/'exhibition').mkdir(parents=True)
            (source/'.venv-pupil'/'bin').mkdir(parents=True)
            (source/'.venv-pupil'/'bin'/'python').touch()
            (source/'.venv-pupil'/'bin'/'python3').symlink_to('python')
            for name in ('start-mac.sh','start-pupil.sh'):(source/name).touch()
            (source/'exhibition'/'mac.py').write_text('version1')
            config=source/'exhibition'/'mac-config.json';config.write_text('original-token')
            app,state=deploy(source,destination,'pupil')
            (state/'mac-config.json').write_text('operator-changes')
            (source/'exhibition'/'mac.py').write_text('version2')
            deploy(source,destination,'pupil')
            self.assertEqual((app/'exhibition'/'mac.py').read_text(),'version2')
            self.assertEqual((state/'mac-config.json').read_text(),'operator-changes')
            self.assertFalse((app/'exhibition'/'mac-config.json').exists())
            spec=agent_spec(app,'pupil',state)
            self.assertEqual(spec['EnvironmentVariables']['EYE_STATE_DIR'],str(state.resolve()))
