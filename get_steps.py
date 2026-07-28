import urllib.request
import json
import sys

run_id = 30178340803
url = f'https://api.github.com/repos/orchiddutta10-web/PRISM-Psychological-Risk-Insight-Signal-Monitoring/actions/runs/{run_id}/jobs'
try:
    with urllib.request.urlopen(url) as response:
        jobs = json.loads(response.read().decode('utf-8'))['jobs']
except Exception as e:
    print(e)
    sys.exit(1)

for j in jobs:
    if j['conclusion'] == 'failure':
        print(f"Job failed: {j['name']}")
        for step in j.get('steps', []):
            print(f"  Step: {step['name']} - Conclusion: {step['conclusion']}")
