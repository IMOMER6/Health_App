#!/usr/bin/env python3
"""
Backend Test Suite for Phase 1 Vital Metrics
Tests the /api/samples, /api/dashboard/24h, and /api/correlation/run endpoints
"""

import requests
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List

# Use the backend URL from frontend .env
BACKEND_URL = "https://vital-metrics-4.preview.emergentagent.com/api"
TEST_USER_ID = "u_test"

def log_test(test_name: str, success: bool, details: str = ""):
    """Log test results"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}")
    if details:
        print(f"   Details: {details}")
    print()

def test_samples_ingestion():
    """Test POST /api/samples with glucose spike and activity dip scenario"""
    print("=== Testing POST /api/samples ===")
    
    # Create timestamps: t0 = 2 hours ago, samples over 2 hour period
    now = datetime.now(timezone.utc)
    t0 = now - timedelta(hours=2)
    
    samples = []
    
    # Blood glucose: baseline at t0 (110 mg/dL), peak at t0+45m (150 mg/dL) - delta 40
    samples.append({
        "type": "blood_glucose",
        "timestamp": t0.isoformat(),
        "data": {"mg_dl": 110, "source": "test_device"}
    })
    
    samples.append({
        "type": "blood_glucose", 
        "timestamp": (t0 + timedelta(minutes=45)).isoformat(),
        "data": {"mg_dl": 150, "source": "test_device"}
    })
    
    # Steps: 0 steps per minute for t0 to t0+25m (26 samples) to trigger <100 steps/20m dip
    for i in range(26):  # 0 to 25 minutes
        samples.append({
            "type": "steps",
            "timestamp": (t0 + timedelta(minutes=i)).isoformat(),
            "data": {"steps": 0, "spm": 0, "interval_minutes": 1}
        })
    
    # Heart rate sample
    samples.append({
        "type": "heart_rate",
        "timestamp": (t0 + timedelta(minutes=30)).isoformat(),
        "data": {"bpm": 75}
    })
    
    # Blood pressure sample  
    samples.append({
        "type": "blood_pressure",
        "timestamp": (t0 + timedelta(minutes=35)).isoformat(),
        "data": {"systolic_mmhg": 120, "diastolic_mmhg": 80}
    })
    
    payload = {
        "user_id": TEST_USER_ID,
        "storage_mode": "raw",
        "samples": samples
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/samples", json=payload, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            expected_count = len(samples)
            actual_count = result.get("inserted", 0)
            
            if actual_count == expected_count:
                log_test("POST /api/samples - Sample ingestion", True, 
                        f"Successfully inserted {actual_count}/{expected_count} samples")
                return True
            else:
                log_test("POST /api/samples - Sample ingestion", False,
                        f"Expected {expected_count} samples, got {actual_count}")
                return False
        else:
            log_test("POST /api/samples - Sample ingestion", False,
                    f"HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        log_test("POST /api/samples - Sample ingestion", False, f"Exception: {str(e)}")
        return False

def test_future_timestamp_rejection():
    """Test POST /api/samples with future timestamp should return 400"""
    print("=== Testing POST /api/samples - Future Timestamp Rejection ===")
    
    # Create timestamp 10 minutes in the future (should be rejected)
    future_time = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    payload = {
        "user_id": TEST_USER_ID,
        "storage_mode": "raw", 
        "samples": [{
            "type": "blood_glucose",
            "timestamp": future_time.isoformat(),
            "data": {"mg_dl": 100}
        }]
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/samples", json=payload, timeout=30)
        
        if response.status_code == 400:
            log_test("POST /api/samples - Future timestamp rejection", True,
                    "Correctly rejected future timestamp with 400 error")
            return True
        else:
            log_test("POST /api/samples - Future timestamp rejection", False,
                    f"Expected 400, got {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        log_test("POST /api/samples - Future timestamp rejection", False, f"Exception: {str(e)}")
        return False

def test_dashboard_24h():
    """Test GET /api/dashboard/24h"""
    print("=== Testing GET /api/dashboard/24h ===")
    
    try:
        response = requests.get(f"{BACKEND_URL}/dashboard/24h?user_id={TEST_USER_ID}", timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            
            # Check required fields
            required_fields = ["window", "series", "correlations"]
            missing_fields = [field for field in required_fields if field not in result]
            
            if missing_fields:
                log_test("GET /api/dashboard/24h - Response structure", False,
                        f"Missing fields: {missing_fields}")
                return False
            
            # Check if series contains our submitted samples
            series = result["series"]
            series_checks = []
            
            # Check blood glucose series
            if "blood_glucose" in series and len(series["blood_glucose"]) >= 2:
                series_checks.append("blood_glucose: ✓")
            else:
                series_checks.append("blood_glucose: ✗")
            
            # Check steps series  
            if "steps_per_min" in series and len(series["steps_per_min"]) >= 20:
                series_checks.append("steps_per_min: ✓")
            else:
                series_checks.append("steps_per_min: ✗")
                
            # Check heart rate series
            if "heart_rate" in series and len(series["heart_rate"]) >= 1:
                series_checks.append("heart_rate: ✓")
            else:
                series_checks.append("heart_rate: ✗")
                
            # Check blood pressure series
            if "blood_pressure" in series and len(series["blood_pressure"]) >= 1:
                series_checks.append("blood_pressure: ✓")
            else:
                series_checks.append("blood_pressure: ✗")
            
            # Check correlations
            correlations = result["correlations"]
            correlations_found = len(correlations) >= 1
            
            all_series_ok = all("✓" in check for check in series_checks)
            
            if all_series_ok and correlations_found:
                log_test("GET /api/dashboard/24h - Data retrieval", True,
                        f"Series: {', '.join(series_checks)}. Correlations: {len(correlations)} found")
                return True
            else:
                log_test("GET /api/dashboard/24h - Data retrieval", False,
                        f"Series: {', '.join(series_checks)}. Correlations: {len(correlations)} found")
                return False
                
        else:
            log_test("GET /api/dashboard/24h - Data retrieval", False,
                    f"HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        log_test("GET /api/dashboard/24h - Data retrieval", False, f"Exception: {str(e)}")
        return False

def test_correlation_run():
    """Test POST /api/correlation/run"""
    print("=== Testing POST /api/correlation/run ===")
    
    try:
        response = requests.post(f"{BACKEND_URL}/correlation/run?user_id={TEST_USER_ID}", timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            
            if "events_created" in result:
                events_created = result["events_created"]
                
                if events_created >= 1:
                    log_test("POST /api/correlation/run - Event creation", True,
                            f"Created {events_created} correlation events")
                    return True
                else:
                    log_test("POST /api/correlation/run - Event creation", False,
                            f"Expected >= 1 events, got {events_created}")
                    return False
            else:
                log_test("POST /api/correlation/run - Event creation", False,
                        "Missing 'events_created' field in response")
                return False
                
        else:
            log_test("POST /api/correlation/run - Event creation", False,
                    f"HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        log_test("POST /api/correlation/run - Event creation", False, f"Exception: {str(e)}")
        return False

def main():
    """Run all backend tests"""
    print("🧪 Starting Phase 1 Vital Metrics Backend Tests")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test User ID: {TEST_USER_ID}")
    print("=" * 60)
    
    results = []
    
    # Test 1: Sample ingestion with correlation scenario
    results.append(test_samples_ingestion())
    
    # Test 2: Dashboard data retrieval
    results.append(test_dashboard_24h())
    
    # Test 3: Correlation engine
    results.append(test_correlation_run())
    
    # Test 4: Future timestamp rejection
    results.append(test_future_timestamp_rejection())
    
    # Summary
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    
    print(f"📊 Test Summary: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Phase 1 backend is working correctly.")
        return True
    else:
        print(f"⚠️  {total - passed} test(s) failed. Backend needs attention.")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)