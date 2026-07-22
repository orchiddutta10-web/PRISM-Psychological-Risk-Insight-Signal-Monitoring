import json

def test_health_check(client):
    """Test the base health check endpoint."""
    response = client.get('/health')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'online'
    assert 'SentinelMind' in data['project']

def test_sensors_latest(client):
    """Test getting the latest sensor reading from the simulator."""
    response = client.get('/api/v1/sensors/latest')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'success'
    
    sensor_data = data['data']
    assert 'heart_rate_bpm' in sensor_data
    assert 'gsr_microsiemens' in sensor_data
    assert 'state' in sensor_data
    assert sensor_data['state'] == 'REST' # Default state

def test_sensors_wave(client):
    """Test generating a continuous PPG pulse wave."""
    response = client.get('/api/v1/sensors/wave?duration=2.0')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'success'
    
    wave = data['data']
    assert 'signal' in wave
    assert 'timestamps' in wave
    assert len(wave['signal']) == 100 # 2.0s * 50Hz

def test_change_state_and_prediction(client):
    """Test overriding state to STRESSED and getting an updated prediction."""
    # 1. Update state to STRESSED
    resp = client.post('/api/v1/sensors/state', 
                       data=json.dumps({"state": "STRESSED"}),
                       content_type='application/json')
    assert resp.status_code == 200
    
    # 2. Verify state change took effect in latest readings
    resp_latest = client.get('/api/v1/sensors/latest')
    assert json.loads(resp_latest.data)['data']['state'] == 'STRESSED'
    
    # 3. Request real-time prediction
    resp_predict = client.get('/api/v1/ml/predict')
    assert resp_predict.status_code == 200
    predict_data = json.loads(resp_predict.data)
    
    assert predict_data['status'] == 'success'
    assert 'prediction' in predict_data
    assert predict_data['prediction']['predicted_state'] == 'STRESSED'
    assert predict_data['prediction']['confidence'] >= 0.55
