"""
Meeting prep data models and schemas
"""
from typing import Optional, Dict, Any, List
from datetime import datetime


def create_meeting_prep_data(
    linkedin_url: str,
    user_id: str,
    user_email: str,
    status: str = 'processing'
) -> Dict[str, Any]:
    """
    Create a new meeting prep data structure for Firestore
    
    Args:
        linkedin_url: LinkedIn profile URL
        user_id: Firebase user ID
        user_email: User email address
        status: Initial status (default: 'processing')
    
    Returns:
        Dictionary with meeting prep data structure
    """
    return {
        'linkedinUrl': linkedin_url,
        'status': status,
        'createdAt': datetime.now().isoformat(),
        'userId': user_id,
        'userEmail': user_email
    }


def update_meeting_prep_status(
    status: str,
    contact_data: Optional[Dict[str, Any]] = None,
    company_news: Optional[List[Dict[str, Any]]] = None,
    similarity_summary: Optional[str] = None,
    coffee_questions: Optional[List[str]] = None,
    pdf_path: Optional[str] = None,
    error: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create update data for meeting prep status changes
    
    Args:
        status: New status
        contact_data: Enriched contact data
        company_news: Company news items
        similarity_summary: Generated similarity summary
        coffee_questions: Generated meeting questions
        pdf_path: Path to generated PDF
        error: Error message if status is 'failed'
    
    Returns:
        Dictionary with status update data
    """
    update_data = {
        'status': status
    }
    
    if contact_data:
        update_data['contactData'] = contact_data
    
    if company_news is not None:
        update_data['companyNews'] = company_news
    
    if similarity_summary:
        update_data['similaritySummary'] = similarity_summary
    
    if coffee_questions:
        update_data['coffeeQuestions'] = coffee_questions
    
    if pdf_path:
        update_data['pdfPath'] = pdf_path
        update_data['completedAt'] = datetime.now().isoformat()
    
    if error:
        update_data['error'] = error
    
    return update_data


def validate_prep_status(status: str) -> bool:
    """Validate that status is a valid value.
    NOTE: These must match the stages used in routes/meeting_prep.py _update_stage().
    """
    valid_statuses = [
        'pending',
        'processing',
        'enriching',
        'researching',
        'analyzing',
        'generating',
        'building',
        'completed',
        'failed',
    ]
    return status in valid_statuses


def format_meeting_prep_response(prep_data: Dict[str, Any], prep_id: str) -> Dict[str, Any]:
    """
    Format meeting prep data for API response
    
    Args:
        prep_data: Raw prep data from Firestore
        prep_id: Prep document ID
    
    Returns:
        Formatted response dictionary
    """
    contact_data = prep_data.get('contactData', {})
    
    return {
        'id': prep_id,
        'prepId': prep_id,  # For backward compatibility
        'status': prep_data.get('status', 'unknown'),
        'linkedinUrl': prep_data.get('linkedinUrl', ''),
        'contactName': f"{contact_data.get('firstName', '')} {contact_data.get('lastName', '')}".strip() or 'Unknown',
        'company': contact_data.get('company', ''),
        'jobTitle': contact_data.get('jobTitle', ''),
        'contactData': contact_data,
        'companyNews': prep_data.get('companyNews', []),
        'similaritySummary': prep_data.get('similaritySummary'),
        'coffeeQuestions': prep_data.get('coffeeQuestions', []),
        'pdfPath': prep_data.get('pdfPath'),
        'pdfUrl': prep_data.get('pdfPath'),  # For backward compatibility
        'error': prep_data.get('error'),
        'createdAt': prep_data.get('createdAt', ''),
        'completedAt': prep_data.get('completedAt', ''),
        'userId': prep_data.get('userId'),
        'userEmail': prep_data.get('userEmail')
    }

