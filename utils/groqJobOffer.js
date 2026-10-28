/**
 * Groq AI Job Offer Description Generator
 * Generates highly polished, supermarket-themed job descriptions for Grandway Shopping
 */

function generateFallbackJobDescription({ positionTitle, department, perks, probationDays, customNotes }) {
    const titleLower = (positionTitle || '').toLowerCase();
    
    let responsibilities = [
        'Deliver outstanding, friendly customer service to store patrons across aisles and registers',
        'Maintain clean, organized, and fully stocked display shelves and retail departments',
        'Collaborate seamlessly with colleagues, shift supervisors, and store management',
        'Actively attend and participate in scheduled store shifts and staff briefings'
    ];

    if (titleLower.includes('cashier') || titleLower.includes('checkout') || titleLower.includes('till')) {
        responsibilities = [
            'Operate modern store checkout lanes and cash registers with speed and accuracy',
            'Greet each customer warmly, scan items efficiently, and handle transactions professionally',
            'Assist shoppers with checkout queries, bagging, and receipt requests',
            'Maintain register area cleanliness and report any register or pricing discrepancies'
        ];
    } else if (titleLower.includes('baker') || titleLower.includes('greggs') || titleLower.includes('pastry') || titleLower.includes('deli')) {
        responsibilities = [
            'Prepare and serve delicious baked goods, hot snacks, and pastries at the fresh counter',
            'Ensure all food preparation complies with the highest kitchen hygiene and quality standards',
            'Replenish heated display cases and bakery shelving with freshly prepared items',
            'Provide attentive, rapid counter service with a welcoming and cheerful attitude'
        ];
    } else if (titleLower.includes('security') || titleLower.includes('guard') || titleLower.includes('loss')) {
        responsibilities = [
            'Monitor store aisles, entrances, and exits to ensure a peaceful shopping environment',
            'Enforce store policies and report exploiters, disruptive players, or shoplifters to HR',
            'Assist customers and colleagues who require assistance or emergency support',
            'Coordinate with shift leadership during high-traffic peak store operations'
        ];
    } else if (titleLower.includes('stock') || titleLower.includes('inventory') || titleLower.includes('logistics')) {
        responsibilities = [
            'Receive deliveries and restock grocery aisles, refrigerated coolers, and promotional endcaps',
            'Ensure inventory is neatly organized, properly faced forward, and easily accessible',
            'Manage backroom storage safely and maintain warehouse aisle clearance',
            'Report low-stock items and damaged goods promptly to management'
        ];
    } else if (titleLower.includes('lead') || titleLower.includes('supervisor') || titleLower.includes('manager') || titleLower.includes('hr')) {
        responsibilities = [
            'Supervise retail colleagues on shift, ensuring high store standards and excellent service',
            'Host engaging store shifts, announce briefings, and coordinate floor assignments',
            'Guide and mentor junior colleagues through their probationary periods',
            'Handle customer inquiries, feedback escalations, and store incidents professionally'
        ];
    }

    if (customNotes) {
        responsibilities.push(`Special Focus: ${customNotes}`);
    }

    const perksList = [
        perks || 'Store colleague discount, shift rewards, and uniform access',
        'Direct advancement pathway to Middle & High Rank management (MR/HR)',
        'Recognition on the weekly Staff Activity Leaderboard and quota bonuses',
        'A vibrant, welcoming, and collaborative community of store colleagues'
    ];

    const requirements = [
        'Maintain a respectful, professional, and mature attitude at all times while representing Grandway Shopping',
        'Regular attendance during hosted store shifts and community events',
        'Clear communication and dedication to teamwork within our staff headquarters',
        probationDays > 0 ? `Successfully complete the ${probationDays}-day probationary onboarding period` : 'Adhere to all store regulations and staff handbook guidelines'
    ];

    return {
        headline: `Step Into an Exciting Retail Career as our next ${positionTitle}!`,
        overview: `Grandway Shopping is thrilled to extend an official employment offer for the position of **${positionTitle}** within the **${department}** department.\n\nAs a vital member of our team, you will play an instrumental role in shaping the daily shopping atmosphere, delighting customers, and keeping our supermarket operating at peak excellence. Whether assisting shoppers or driving team success, your contributions will directly impact our community.`,
        responsibilities,
        requirements,
        perks_and_growth: perksList,
        closing_note: 'We are eager to welcome you to the Grandway Shopping family and see you thrive in this exciting new position!'
    };
}

/**
 * Generates an engaging, professional, Roblox supermarket-themed job description via Groq AI
 */
async function generateAiJobDescription({
    positionTitle,
    department = 'Store Operations & Customer Experience',
    perks,
    probationDays = 7,
    customNotes,
    hiringManagerName,
    guildName = 'Grandway Shopping'
}) {
    const apiKey = process.env.GROQ_API_KEY;
    const fallback = generateFallbackJobDescription({ positionTitle, department, perks, probationDays, customNotes });

    if (!apiKey) {
        return fallback;
    }

    const candidateModels = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-120b',
        'qwen/qwen3.8-27b'
    ];

    const systemPrompt = `You are the Chief Human Resources Officer and Recruitment Director for "${guildName}" (a popular, immersive Roblox supermarket, grocery store, and retail experience).
Your goal is to generate a realistic, compelling, professional job offer package for a candidate.

Always return valid JSON ONLY with this exact structure:
{
  "headline": "A punchy, enthusiastic 1-sentence hook or welcoming title for this role",
  "overview": "A polished 2-paragraph job description describing why this position is exciting, its importance in the store, and how it impacts the shopping experience",
  "responsibilities": [
    "3 to 5 realistic, detailed supermarket job duties tailored specifically to this position"
  ],
  "requirements": [
    "3 to 4 professional expectations (store etiquette, shift participation, teamwork, customer service)"
  ],
  "perks_and_growth": [
    "3 to 4 perks, career growth paths, promotions, or benefits"
  ],
  "closing_note": "A warm, inspiring 1-sentence welcome message from the hiring team"
}`;

    const userPrompt = `Generate an official retail job offer description for:
Position: ${positionTitle}
Department: ${department}
Hiring Manager: ${hiringManagerName}
Key Perks / Compensation: ${perks || 'Store colleague discount, shift rewards, fast-track promotion to MR/HR'}
Probationary Period: ${probationDays > 0 ? `${probationDays} days` : 'None / Immediate Full Colleague'}
Special Recruiter Notes: ${customNotes || 'Demonstrated outstanding dedication and passion for supermarket excellence'}`;

    for (const model of candidateModels) {
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.65,
                    response_format: { type: 'json_object' }
                }),
                signal: AbortSignal.timeout(12000)
            });

            if (!res.ok) {
                console.warn(`[GROQ JOB OFFER] Model ${model} HTTP error ${res.status}`);
                continue;
            }

            const data = await res.json();
            const rawContent = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (rawContent) {
                const parsed = JSON.parse(rawContent);
                if (parsed.headline && parsed.overview && Array.isArray(parsed.responsibilities) && parsed.responsibilities.length > 0) {
                    return parsed;
                }
            }
        } catch (err) {
            console.warn(`[GROQ JOB OFFER] Model ${model} error:`, err.message);
        }
    }

    return fallback;
}

module.exports = {
    generateAiJobDescription,
    generateFallbackJobDescription
};
