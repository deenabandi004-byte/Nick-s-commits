from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import requests
import datetime
import csv
import os
import json
from io import StringIO

app = Flask(__name__)
CORS(app)

# API Keys and Configuration
APOLLO_API_KEY = '49cZmc1UCvGu13SQQaVH6A'
APOLLO_URL = 'https://api.apollo.io/api/v1/mixed_people/search'
PEOPLE_DATA_LABS_API_KEY = 'test_key'  # Will mock this for testing
OPENAI_API_KEY = 'test_key'  # Will mock this for testing

def mock_enrich_with_people_data_labs(contact):
    """Mock enrichment for testing without PDL API"""
    print(f"🧪 Mock enriching {contact.get('FirstName', 'Unknown')}")
    
    # Add mock enriched data
    contact.update({
        'Phone': '+1-555-0123',
        'PersonalEmail': f"{contact.get('FirstName', 'test').lower()}@gmail.com",
        'WorkEmail': contact.get('Email', ''),
        'SocialProfiles': 'Twitter: @testuser',
        'EducationTop': contact.get('College', '') or 'Harvard Business School - MBA',
        'VolunteerHistory': 'United Way (2020-Present); Local Food Bank (2019-2021)',
        'WorkSummary': f"{contact.get('Title', 'Professional')} at {contact.get('Company', 'Previous Co')}; Analyst at Consulting Firm",
        'Group': 'Young Professionals Network; Industry Association'
    })
    
    return contact

def mock_generate_personalized_email(contact):
    """Mock email generation for testing without OpenAI API"""
    print(f"🧪 Mock generating email for {contact.get('FirstName', 'Unknown')}")
    
    email_subject = f"Quick Chat to Learn about Your Work at {contact.get('Company', '')}?"
    
    email_body = f"""Hi {contact.get('FirstName', '')},

I hope you're doing well! My name is [Your Name], and I'm currently a [Your year/major] at [Your University]. I came across your profile while researching {contact.get('Company', '')}/{contact.get('Title', '').split()[0] if contact.get('Title') else 'your industry'} and was really inspired by your work as {contact.get('Title', '')}.

I'm very interested in {contact.get('Title', '').lower() if contact.get('Title') else 'your field'} and would really appreciate the chance to learn more about your journey and any advice you may have. If you're open to it, would you be available for a quick 15–20 minute chat sometime this or next week?

Thanks so much in advance - I'd love to hear your perspective!

Warmly,
[Your Full Name]"""
    
    return email_subject, email_body

def mock_create_gmail_draft(contact, email_subject, email_body):
    """Mock Gmail draft creation for testing"""
    print(f"🧪 Mock creating Gmail draft for {contact.get('FirstName', 'Unknown')}")
    print(f"   📧 Subject: {email_subject}")
    print(f"   📧 To: {contact.get('Email', 'N/A')}")
    print(f"   📧 Body preview: {email_body[:100]}...")
    
    return f"mock_draft_id_{contact.get('FirstName', 'unknown').lower()}"

def mock_save_to_firestore(contacts, uid):
    """Mock Firestore save for testing"""
    print(f"🧪 Mock saving {len(contacts)} contacts to Firestore for user {uid}")
    for i, contact in enumerate(contacts):
        print(f"   📄 Contact {i+1}: {contact.get('FirstName', '')} {contact.get('LastName', '')} at {contact.get('Company', '')}")

@app.route('/ping')
def ping():
    print("✅ /ping route was hit")
    return "pong"

@app.route('/api/advanced-run', methods=['POST'])
def advanced_run():
    print("🚨 /api/advanced-run endpoint was triggered 🚨")
    try:
        data = request.json
        print("🧾 Incoming data:", data)

        job_title = data['jobTitle']
        company = data['company']
        location = data['location']
        uid = data.get('uid', 'demo-user-advanced')

        headers = {'X-Api-Key': APOLLO_API_KEY}
        all_contacts = []
        seen_linkedin = set()
        page = 1
        max_pages = 3  # Reduced for testing
        max_contacts = 3  # Reduced for testing

        print(f"🎯 Starting advanced search for {job_title} at {company} in {location}")

        # Step 1: Apollo Search (same as basic but limited to 3 for testing)
        while len(all_contacts) < max_contacts and page <= max_pages:
            company_variations = [
                company,
                f"{company} & Company" if company in ["Bain", "McKinsey"] else company,
                f"{company} & Co" if company in ["Bain", "McKinsey"] else company,
                f"{company} Company" if company not in ["Company"] else company,
            ]
            company_variations = list(dict.fromkeys(company_variations))
            
            payload = {
                'organization_names': company_variations,
                'person_titles': [job_title],
                'person_locations': [location],
                'page': page,
                'per_page': 25
            }

            print(f"🌐 Fetching page {page} from Apollo")
            print(f"🏢 Searching for variations: {company_variations}")
            response = requests.post(APOLLO_URL, headers=headers, json=payload)
            
            if response.status_code != 200:
                print(f"❌ Apollo API failed with status {response.status_code}: {response.text}")
                break

            result = response.json()
            people = result.get('people', [])
            print(f"📊 Found {len(people)} people on page {page}")
            
            if not people:
                print("⚠️ No more people found on page", page)
                break

            for person in people:
                linkedin = person.get("linkedin_url")
                person_org = person.get('organization', {}).get('name', 'N/A')
                person_first_name = person.get('first_name', 'Unknown')
                
                print(f"👤 Checking: {person_first_name} from {person_org}")
                
                if not linkedin or linkedin in seen_linkedin:
                    print(f"   ⚠️ Skipping: No LinkedIn or already seen")
                    continue

                # Company matching logic
                current_employment = person.get('employment_history', [])
                current_company_match = False
                
                org_name = person.get('organization', {}).get('name', '').lower().strip()
                target_company_lower = company.lower().strip()
                
                if org_name and org_name not in ['n/a', 'na', 'none', 'unknown', '']:
                    if (target_company_lower in org_name or 
                        org_name in target_company_lower or
                        any(word in org_name for word in target_company_lower.split() if len(word) > 2)):
                        current_company_match = True
                        print(f"   ✅ Current org match: {org_name}")

                if not current_company_match and current_employment:
                    current_job = current_employment[0]
                    current_org = current_job.get('organization_name', '').lower().strip()
                    
                    if current_org and current_org not in ['n/a', 'na', 'none', 'unknown', '']:
                        if (target_company_lower in current_org or 
                            current_org in target_company_lower or
                            any(word in current_org for word in target_company_lower.split() if len(word) > 2)):
                            current_company_match = True
                            print(f"   ✅ Employment history match: {current_org}")

                if not current_company_match:
                    print(f"   🚫 No match for target: {company}")
                    continue

                seen_linkedin.add(linkedin)

                # Get basic contact info
                current_title = ""
                current_company_name = company
                if current_employment:
                    current_title = current_employment[0].get('title', '')
                    current_company_name = current_employment[0].get('organization_name', company)

                contact = {
                    'FirstName': person.get('first_name', ''),
                    'LastName': person.get('last_name', ''),
                    'LinkedIn': linkedin,
                    'Email': person.get('email', 'email_not_available@domain.com'),
                    'Title': current_title,
                    'Company': current_company_name,
                    'City': person.get('city', ''),
                    'State': person.get('state', ''),
                    'College': person.get('education', [{}])[0].get('name', '') if person.get('education') else ''
                }

                print(f"✅ Added contact: {contact['FirstName']} {contact['LastName']} - {contact['Title']} at {contact['Company']}")
                all_contacts.append(contact)

                if len(all_contacts) == max_contacts:
                    break

            page += 1

        print(f"🎯 Total Apollo contacts found: {len(all_contacts)}")

        if not all_contacts:
            return jsonify({'error': 'No valid contacts found matching the criteria'}), 404

        # Step 2: Mock Enrich with People Data Labs
        print("🔍 Starting mock People Data Labs enrichment...")
        enriched_contacts = []
        for i, contact in enumerate(all_contacts):
            print(f"📈 Enriching contact {i+1}/{len(all_contacts)}: {contact['FirstName']} {contact['LastName']}")
            enriched_contact = mock_enrich_with_people_data_labs(contact)
            enriched_contacts.append(enriched_contact)

        # Step 3: Mock Generate personalized emails
        print("✍️ Generating mock personalized emails...")
        
        for i, contact in enumerate(enriched_contacts):
            print(f"📧 Generating email {i+1}/{len(enriched_contacts)}: {contact['FirstName']} {contact['LastName']}")
            email_subject, email_body = mock_generate_personalized_email(contact)
            
            # Mock Create Gmail draft
            draft_id = mock_create_gmail_draft(contact, email_subject, email_body)
            contact['draft_id'] = draft_id

        # Step 4: Mock Save to Firestore
        print("💾 Mock saving to Firestore...")
        mock_save_to_firestore(enriched_contacts, uid)

        # Step 5: Generate enhanced CSV
        print("📄 Generating enhanced CSV...")
        csv_file = StringIO()
        fieldnames = [
            'FirstName', 'LastName', 'LinkedIn', 'Email', 'Title', 'Company', 
            'City', 'State', 'College', 'Phone', 'PersonalEmail', 'WorkEmail', 
            'SocialProfiles', 'EducationTop', 'VolunteerHistory', 'WorkSummary', 'Group'
        ]
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        
        for contact in enriched_contacts:
            # Remove draft_id and other non-CSV fields
            csv_contact = {k: v for k, v in contact.items() if k in fieldnames}
            writer.writerow(csv_contact)

        csv_filename = "RecruitEdge_Advanced_Test.csv"
        with open(csv_filename, 'w', newline='', encoding='utf-8') as f:
            f.write(csv_file.getvalue())

        print(f"🎉 Mock advanced workflow completed! Generated {len(enriched_contacts)} enriched contacts.")
        print("📋 CSV Preview:")
        print(csv_file.getvalue()[:500] + "..." if len(csv_file.getvalue()) > 500 else csv_file.getvalue())
        
        return send_file(csv_filename, as_attachment=True)

    except Exception as e:
        print("❌ Exception occurred:", e)
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("🧪 Running RecruitEdge Advanced Test Server")
    print("📡 Available endpoints:")
    print("  - GET  /ping")
    print("  - POST /api/advanced-run")
    print("\nTo test, run:")
    print("curl -X POST http://localhost:5001/api/advanced-run \\")
    print("  -H 'Content-Type: application/json' \\")
    print("  -d '{\"jobTitle\":\"Investment Banker\",\"company\":\"Wells Fargo\",\"location\":\"New York\",\"uid\":\"test-user\"}'")
    app.run(host='0.0.0.0', port=5001, debug=True)