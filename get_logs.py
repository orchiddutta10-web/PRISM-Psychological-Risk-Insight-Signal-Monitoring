import urllib.request
import json

url = 'https://api.github.com/repos/orchiddutta10-web/PRISM-Psychological-Risk-Insight-Signal-Monitoring/actions/runs?per_page=1'
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode('utf-8'))
    
run_id = data['workflow_runs'][0]['id']
print(f'Run ID: {run_id}')

url = f'https://api.github.com/repos/orchiddutta10-web/PRISM-Psychological-Risk-Insight-Signal-Monitoring/actions/runs/{run_id}/jobs'
with urllib.request.urlopen(url) as response:
    jobs = json.loads(response.read().decode('utf-8'))['jobs']

for j in jobs:
    if j['conclusion'] == 'failure':
        print('Failed:', j['name'])
        print('URL:', j['url'])
        
        # fetch logs for this job
        log_url = f"https://api.github.com/repos/orchiddutta10-web/PRISM-Psychological-Risk-Insight-Signal-Monitoring/actions/jobs/{j['id']}/logs"
        try:
            with urllib.request.urlopen(log_url) as log_res:
                logs = log_res.read().decode('utf-8')
                print('\n--- LOGS ---')
                print('\n'.join(logs.splitlines()[-100:])) # last 100 lines
        except Exception as e:
            print("Could not fetch logs:", e)
