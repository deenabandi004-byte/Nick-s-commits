# Fix: Firestore DocumentReference Serialization Error in Job Board

## Problem

When calling `/api/job-board/optimize-resume` or `/api/job-board/generate-cover-letter`, the backend throws:

```
[JobBoard] Resume optimization error: sequence item 1: expected str instance, DocumentReference found
```

This happens because the user's `resumeParsed` data in Firestore contains `DocumentReference` objects (or other Firestore-specific types like `datetime`, `GeoPoint`) that can't be serialized to JSON when building the AI prompt.

## Solution

Update `backend/app/routes/job_board.py` with the following changes:

### Step 1: Add Helper Function

Add this helper function near the top of the file, after the imports and before the constants:

```python
# =============================================================================
# FIRESTORE DATA SANITIZATION
# =============================================================================

def sanitize_firestore_data(obj):
    """
    Recursively convert Firestore-specific types to JSON-serializable types.
    
    Handles:
    - DocumentReference → string path
    - datetime → ISO format string
    - GeoPoint → dict with lat/lng
    - Nested dicts and lists
    
    Args:
        obj: Any object that might contain Firestore types
        
    Returns:
        JSON-serializable version of the object
    """
    if obj is None:
        return None
    elif isinstance(obj, dict):
        return {k: sanitize_firestore_data(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_firestore_data(item) for item in obj]
    elif hasattr(obj, 'path'):  # DocumentReference
        return str(obj.path)
    elif hasattr(obj, 'isoformat'):  # datetime
        return obj.isoformat()
    elif hasattr(obj, 'latitude'):  # GeoPoint
        return {"lat": obj.latitude, "lng": obj.longitude}
    elif hasattr(obj, '_pb'):  # Other Firestore protobuf types
        return str(obj)
    else:
        return obj
```

### Step 2: Update optimize_resume() Route

Find the `optimize_resume()` function and locate this line:

```python
# Get user's resume
user_resume = user_data.get("resumeParsed", {})
```

Replace it with:

```python
# Get user's resume - sanitize Firestore types for JSON serialization
user_resume = sanitize_firestore_data(user_data.get("resumeParsed", {}))
```

### Step 3: Update generate_cover_letter() Route

Find the `generate_cover_letter()` function and locate this line:

```python
# Get user's resume
user_resume = user_data.get("resumeParsed", {})
```

Replace it with:

```python
# Get user's resume - sanitize Firestore types for JSON serialization
user_resume = sanitize_firestore_data(user_data.get("resumeParsed", {}))
```

## Complete Fix Location Reference

The changes should be made in these locations within `job_board.py`:

1. **Line ~50-80** (after imports): Add the `sanitize_firestore_data()` helper function
2. **In `optimize_resume()` route**: Around line ~380-400 where `user_resume` is retrieved
3. **In `generate_cover_letter()` route**: Around line ~440-460 where `user_resume` is retrieved

## Why This Works

Firestore stores special types that don't have direct JSON equivalents:
- `DocumentReference` - A pointer to another document
- `Timestamp` - Firestore's datetime type
- `GeoPoint` - Geographic coordinates

When we pass `user_resume` to `json.dumps()` in the AI prompt, these types cause serialization errors. The `sanitize_firestore_data()` function recursively walks through the data structure and converts all Firestore types to standard Python types that JSON can handle.

## Testing

After making these changes:

1. Restart the backend server
2. Go to Job Board → Tab 2 (Optimize)
3. Paste a job URL or description
4. Click "Optimize Resume" - should now work without the error
5. Click "Cover Letter" - should also work

The ATS score and optimized content should display correctly.
