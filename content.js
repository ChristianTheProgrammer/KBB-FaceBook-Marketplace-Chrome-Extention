// Suppress third-party cookie warnings
const originalConsoleWarn = console.warn;
console.warn = function(...args) {
    if (args[0]?.includes('third-party cookie')) return;
    originalConsoleWarn.apply(console, args);
};

// Function to inject our helper script
function injectHelperScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}

// Debug helper function to log DOM structure
function debugLogDOMStructure() {
    console.log("=== DOM Structure Debug ===");
    console.log("1. All H1 elements:", document.querySelectorAll('h1'));
    console.log("2. Main content:", document.querySelector('div[role="main"]'));
    console.log("3. All spans:", document.querySelectorAll('span'));
    
    // Log all text content that might contain car information
    const allTextElements = document.querySelectorAll('h1, h2, h3, span, div');
    const carRelatedText = Array.from(allTextElements)
        .map(el => el.textContent.trim())
        .filter(text => text.length > 10)
        .filter(text => /\d{4}|\bcar\b|\bvehicle\b|\bauto\b/i.test(text));
    
    console.log("4. Potential car-related text found:", carRelatedText);
}

// Function to extract car details from Facebook Marketplace listing
function extractCarDetails() {
    console.debug("Attempting to extract car details...");
    
    // Try to find the car title
    const titleElement = findCarTitle();
    if (!titleElement) {
        console.debug("No title element found");
        return null;
    }

    const title = titleElement.textContent.trim();
    console.debug("Found title:", title);
    
    // Extract car details from title with improved regex for full model names
    // This regex captures: year, make, and everything after as potential model/trim
    const carRegex = /(\d{4})\s+([\w-]+)\s+(.*?)(?:\s*$)/i;
    const match = title.match(carRegex);
    
    if (!match) return null;

    // Extract the full model and trim information
    const year = match[1];
    const make = match[2].replace(/-/g, ' ');
    let model = '';
    let trim = '';

    // Process the remaining text to separate model and trim
    const remainingText = match[3].trim();
    
    // Common model/trim patterns
    const modelTrimPatterns = {
        // BMW: "3 Series 328i", "M3 Competition"
        BMW: /^(\d\s*(?:Series|M|X|Z)\s*\d*)\s*(.*?)$/i,
        // Mercedes: "C-Class C300", "GLE 450"
        Mercedes: /^([A-Z]-?Class|[A-Z]{2,3})\s*(.*?)$/i,
        // Audi: "A4 Premium Plus", "Q5 Prestige"
        Audi: /^([A-Z]\d|[A-Z]{2}\d)\s*(.*?)$/i,
        // Toyota: "Camry SE", "RAV4 Limited"
        Toyota: /^(\w+)\s*(.*?)$/i,
        // Honda: "Civic LX", "CR-V EX-L"
        Honda: /^([\w-]+)\s*(.*?)$/i,
        // Default pattern for other makes
        default: /^([\w-]+)\s*(.*?)$/i
    };

    // Get the appropriate pattern for the make or use default
    const pattern = modelTrimPatterns[make] || modelTrimPatterns.default;
    const modelMatch = remainingText.match(pattern);

    if (modelMatch) {
        model = modelMatch[1].trim();
        trim = modelMatch[2].trim();
    } else {
        model = remainingText;
    }

    // Extract mileage and price
    const mileage = extractMileage();
    const price = extractPrice();

    // Log the extracted details
    console.debug("Extracted details:", {
        year,
        make,
        model,
        trim,
        mileage,
        price
    });

    return {
        year,
        make,
        model,
        trim,
        mileage,
        price
    };
}

// Helper function to find the car title
function findCarTitle() {
    // Try multiple selectors for the title
    const titleSelectors = [
        'h1',
        '[data-testid="marketplace-listing-title"]',
        'div[role="main"] span:first-child',
        'div[class*="title"]'
    ];

    for (const selector of titleSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            const text = element.textContent.trim();
            // Look for patterns like "2015 Honda Civic" or "2018 BMW M3"
            if (/\d{4}\s+[A-Za-z-]+\s+[A-Za-z0-9-]+/.test(text)) {
                return element;
            }
        }
    }

    // If no title found with selectors, try to find any element with car-like text
    const allElements = document.querySelectorAll('div, span');
    for (const element of allElements) {
        const text = element.textContent.trim();
        if (text.length > 10 && text.length < 100 && /\d{4}\s+[A-Za-z-]+\s+[A-Za-z0-9-]+/.test(text)) {
            return element;
        }
    }

    return null;
}

// Function to extract price from the listing
function extractPrice() {
    console.debug("Starting price extraction...");

    // Try to find price with $ symbol first
    const elements = document.querySelectorAll('div, span');
    for (const element of elements) {
        const text = element.textContent.trim();
        if (text.includes('$')) {
            const match = text.match(/\$\s*([\d,]+)/);
            if (match) {
                const price = parseInt(match[1].replace(/,/g, ''));
                console.debug(`Found price: $${price}`);
                return price;
            }
        }
    }

    return null;
}

// Function to extract mileage from the listing
function extractMileage() {
    console.debug("Starting mileage extraction...");

    // First try: Look specifically for "Driven X miles" text
    const detailsElements = Array.from(document.querySelectorAll('div, span'))
        .filter(el => el.textContent.includes('Driven') && el.textContent.includes('miles'));
    
    if (detailsElements.length > 0) {
        for (const element of detailsElements) {
            const text = element.textContent.trim();
            console.debug(`Found details text: "${text}"`);
            
            const match = text.match(/Driven\s+([\d,]+)\s*miles/i);
            if (match) {
                const mileage = parseInt(match[1].replace(/,/g, ''));
                console.debug(`Extracted mileage from details: ${mileage}`);
                return mileage;
            }
        }
    }

    // Second try: Look for any element containing mileage information
    const mileageElements = Array.from(document.querySelectorAll('div, span'))
        .filter(el => {
            const text = el.textContent.trim();
            return text.length < 100 && /\d+\s*(?:,\d+)?\s*miles/i.test(text);
        });
    
    if (mileageElements.length > 0) {
        for (const element of mileageElements) {
            const text = element.textContent.trim();
            console.debug(`Found mileage text: "${text}"`);
            
            const match = text.match(/([\d,]+)\s*miles/i);
            if (match) {
                const mileage = parseInt(match[1].replace(/,/g, ''));
                console.debug(`Extracted mileage: ${mileage}`);
                return mileage;
            }
        }
    }

    // Third try: Look for "Details" section
    const detailsSection = Array.from(document.querySelectorAll('div'))
        .find(el => el.textContent.includes('Details') && el.textContent.includes('miles'));
    
    if (detailsSection) {
        const text = detailsSection.textContent;
        console.debug(`Found details section: "${text}"`);
        
        const match = text.match(/Driven\s+([\d,]+)\s*miles/i) || text.match(/([\d,]+)\s*miles/i);
        if (match) {
            const mileage = parseInt(match[1].replace(/,/g, ''));
            console.debug(`Extracted mileage from details section: ${mileage}`);
            return mileage;
        }
    }

    // Fourth try: Check for mileage in the description
    const descriptionElements = Array.from(document.querySelectorAll('div'))
        .filter(el => el.textContent.includes('Description') || el.textContent.toLowerCase().includes('mileage'));
    
    for (const element of descriptionElements) {
        const text = element.textContent;
        const match = text.match(/mileage:?\s*([\d,]+)/i) || 
                     text.match(/([\d,]+)\s*miles/i) ||
                     text.match(/miles:?\s*([\d,]+)/i);
        
        if (match) {
            const mileage = parseInt(match[1].replace(/,/g, ''));
            console.debug(`Extracted mileage from description: ${mileage}`);
            return mileage;
        }
    }

    // If all else fails, try to find any number followed by "miles" in the entire page
    const bodyText = document.body.textContent;
    const bodyMatch = bodyText.match(/Driven\s+([\d,]+)\s*miles/i) || 
                     bodyText.match(/([\d,]+)\s*miles/i);
    
    if (bodyMatch) {
        const mileage = parseInt(bodyMatch[1].replace(/,/g, ''));
        console.debug(`Extracted mileage from body text: ${mileage}`);
        return mileage;
    }

    console.debug("No mileage found");
    return null;
}

// Function to fetch vehicle data from NHTSA API
async function getNHTSAData(carDetails) {
    try {
        const year = carDetails.year;
        const make = encodeURIComponent(carDetails.make);
        const model = encodeURIComponent(carDetails.model);
        
        // Get vehicle information from NHTSA
        const response = await fetch(
            `https://api.nhtsa.gov/vehicles/GetModelsForMakeYear/make/${make}/modelYear/${year}?model=${model}`
        );
        const data = await response.json();
        return data.Results[0];
    } catch (error) {
        console.error('Error fetching NHTSA data:', error);
        return null;
    }
}

// Function to get market value estimate
async function getMarketValueEstimate(carDetails) {
    // Calculate depreciation based on age and mileage
    const currentYear = new Date().getFullYear();
    const age = currentYear - parseInt(carDetails.year);
    const mileage = parseInt(carDetails.mileage) || 0;
    
    // Average car depreciation rates
    const firstYearDepreciation = 0.20;
    const subsequentYearDepreciation = 0.10;
    const mileageDepreciation = 0.00002; // per mile

    // Get listed price
    const listedPrice = parseInt(carDetails.price) || 0;
    
    if (!listedPrice) {
        return {
            estimate: null,
            confidence: "low",
            message: "Unable to calculate estimate - no listing price found"
        };
    }

    // Calculate rough market value
    let estimatedValue = listedPrice;
    let confidence = "medium";
    let analysis = [];

    // Age-based depreciation
    if (age > 0) {
        const totalDepreciation = firstYearDepreciation + 
            (Math.min(age - 1, 5) * subsequentYearDepreciation);
        estimatedValue = listedPrice / (1 - totalDepreciation);
        analysis.push(`${age} years old: Expected ${Math.round(totalDepreciation * 100)}% depreciation`);
    }

    // Mileage-based adjustment
    if (mileage > 0) {
        const mileageImpact = 1 - (mileage * mileageDepreciation);
        estimatedValue *= mileageImpact;
        analysis.push(`${mileage.toLocaleString()} miles: Adjusted value by ${Math.round((1-mileageImpact) * 100)}%`);
    }

    // Market condition adjustments
    const marketConditions = await getMarketConditions(carDetails.make, carDetails.model);
    if (marketConditions) {
        estimatedValue *= marketConditions.factor;
        analysis.push(marketConditions.message);
    }

    return {
        estimate: Math.round(estimatedValue),
        confidence: confidence,
        analysis: analysis
    };
}

// Function to get current market conditions
async function getMarketConditions(make, model) {
    // This could be expanded with real market data APIs
    const commonBrands = ['toyota', 'honda', 'ford', 'chevrolet', 'nissan'];
    const luxuryBrands = ['bmw', 'mercedes', 'audi', 'lexus'];
    
    make = make.toLowerCase();
    
    if (commonBrands.includes(make)) {
        return {
            factor: 1.05,
            message: "Popular brand with strong resale value"
        };
    } else if (luxuryBrands.includes(make)) {
        return {
            factor: 0.95,
            message: "Luxury vehicle - typically higher depreciation"
        };
    }
    return null;
}

// Helper function to format model names for URLs
function formatModelForUrl(make, model, site) {
    const makeL = make.toLowerCase();
    const modelL = model.toLowerCase();

    // Common model name mappings
    const modelMappings = {
        // BMW
        '3': '3-series',
        '5': '5-series',
        '7': '7-series',
        // Mercedes
        'c': 'c-class',
        'e': 'e-class',
        's': 's-class',
        // Lexus
        'is': 'is',
        'es': 'es',
        'rx': 'rx',
        // Default: just use the model name as is
        'default': modelL
    };

    // Site-specific formatting
    switch(site) {
        case 'kbb':
        case 'edmunds':
            // These sites typically use hyphenated names
            return modelMappings[modelL] || modelL.replace(/\s+/g, '-');
        case 'autotempest':
            // AutoTempest only allows letters, numbers, and periods
            return modelL.replace(/[^a-zA-Z0-9.]/g, '');
        case 'jdpower':
            return modelL.replace(/\s+/g, '-');
        default:
            return modelL;
    }
}

// Function to create KBB URL and price estimate
async function getKBBPrice(carDetails) {
    console.debug("Generating KBB information for:", carDetails);
    
    // Format URLs and search parameters
    const makeEncoded = encodeURIComponent(carDetails.make);
    const modelEncoded = encodeURIComponent(formatModelForUrl(carDetails.make, carDetails.model, 'autotempest'));
    const yearEncoded = encodeURIComponent(carDetails.year);
    const fullModelName = `${carDetails.year} ${carDetails.make} ${carDetails.model}${carDetails.trim ? ' ' + carDetails.trim : ''}`;
    const zipCode = '60601'; // Default to Chicago

    // Construct specific URLs for each service
    const urls = {
        kbb: `https://www.kbb.com/${carDetails.make.toLowerCase().replace(/\s+/g, '-')}/${formatModelForUrl(carDetails.make, carDetails.model, 'kbb')}/${carDetails.year}/`,
        edmunds: `https://www.edmunds.com/${carDetails.make.toLowerCase().replace(/\s+/g, '-')}/${formatModelForUrl(carDetails.make, carDetails.model, 'edmunds')}/${carDetails.year}/review/`,
        consumerReports: `https://www.consumerreports.org/cars/${carDetails.make.toLowerCase()}/${formatModelForUrl(carDetails.make, carDetails.model, 'consumerReports')}/${carDetails.year}/overview/`,
        autotempest: `https://www.autotempest.com/results?make=${makeEncoded}&model=${modelEncoded}&zip=${zipCode}&radius=100&years=${yearEncoded}-${yearEncoded}`,
        jdpower: `https://www.jdpower.com/cars/${yearEncoded}/${makeEncoded}/${formatModelForUrl(carDetails.make, carDetails.model, 'jdpower')}`
    };

    // Calculate various metrics
    const currentYear = new Date().getFullYear();
    const vehicleAge = currentYear - carDetails.year;
    
    // Handle mileage analysis
    let mileageAnalysis = '';
    if (carDetails.mileage) {
        const expectedMileage = vehicleAge * 12000; // Industry standard
        const mileageDifference = carDetails.mileage - expectedMileage;
        const mileageStatus = Math.abs(mileageDifference) > 5000 
            ? (mileageDifference > 0 ? 'Higher than average' : 'Lower than average')
            : 'Average';
            
        mileageAnalysis = `
            • Expected Mileage: ${expectedMileage.toLocaleString()} miles<br>
            • Actual Mileage: ${carDetails.mileage.toLocaleString()} miles<br>
            • Status: ${mileageStatus} (${Math.abs(mileageDifference).toLocaleString()} miles ${mileageDifference > 0 ? 'above' : 'below'} average)
        `;
    } else {
        mileageAnalysis = `
            • Expected Mileage: ${(vehicleAge * 12000).toLocaleString()} miles<br>
            • Actual Mileage: Not available
        `;
    }
    
    // Create detailed response HTML
    const response = `
        <div class="kbb-details">
            <div class="car-info">
                <strong>Vehicle Details:</strong><br>
                ${carDetails.year} ${carDetails.make} ${carDetails.model} ${carDetails.trim}<br>
                ${carDetails.mileage ? `Mileage: ${carDetails.mileage.toLocaleString()} miles<br>` : 'Mileage: Not available<br>'}
                ${carDetails.price ? `Listed Price: $${carDetails.price.toLocaleString()}` : 'Price: Not listed'}
            </div>
            
            <div class="market-analysis">
                <strong>Market Analysis:</strong><br>
                • Vehicle Age: ${vehicleAge} years<br>
                ${mileageAnalysis}
            </div>

            <div class="resources">
                <strong>Pricing & Reviews:</strong><br>
                <a href="${urls.kbb}" target="_blank">
                    ➤ Kelley Blue Book Valuation
                </a><br>
                <a href="${urls.edmunds}" target="_blank">
                    ➤ Edmunds Expert Review
                </a><br>
                <a href="${urls.consumerReports}" target="_blank">
                    ➤ Consumer Reports Review
                </a><br>
                <a href="${urls.jdpower}" target="_blank">
                    ➤ JD Power Ratings
                </a>
            </div>

            <div class="resources">
                <strong>Market Search:</strong><br>
                <a href="${urls.autotempest}" target="_blank">
                    ➤ AutoTempest Price Comparison
                </a>
            </div>
        </div>
    `;
    
    return response;
}

// Function to inject KBB price into the page
function injectKBBPrice(kbbPrice) {
    console.debug("Injecting KBB price information...");

    // Remove any existing KBB container
    const existingContainer = document.getElementById('kbb-price-container');
    if (existingContainer) {
        existingContainer.remove();
    }

    // Detect if Facebook is in dark mode
    const isDarkMode = document.documentElement.classList.contains('__fb-dark-mode') || 
                      document.body.classList.contains('__fb-dark-mode') ||
                      document.querySelector('body[class*="dark"]') !== null;
    
    // Set theme colors based on Facebook's mode
    const theme = {
        background: isDarkMode ? '#242526' : '#ffffff',
        cardBackground: isDarkMode ? '#3a3b3c' : '#f0f2f5',
        text: isDarkMode ? '#e4e6eb' : '#050505',
        secondaryText: isDarkMode ? '#b0b3b8' : '#65676b',
        border: isDarkMode ? '#3a3b3c' : '#dadde1',
        accent: '#1877f2', // Facebook blue
        hover: isDarkMode ? '#4e4f50' : '#e4e6eb',
        shadow: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.1)'
    };

    // Create new container with Facebook-like styling
    const priceContainer = document.createElement('div');
    priceContainer.id = 'kbb-price-container';
    priceContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 340px;
        background-color: ${theme.background};
        border-radius: 8px;
        box-shadow: 0 2px 12px ${theme.shadow};
        z-index: 9999;
        max-height: 80vh;
        overflow-y: auto;
        font-family: Helvetica, Arial, sans-serif;
        color: ${theme.text};
        transition: all 0.2s ease;
        border: 1px solid ${theme.border};
    `;

    // Create header with Facebook-like styling
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid ${theme.border};
    `;

    const title = document.createElement('div');
    title.textContent = 'Vehicle Market Analysis';
    title.style.cssText = `
        font-weight: 600;
        font-size: 16px;
        color: ${theme.text};
    `;

    // Add Facebook-like close button
    const closeButton = document.createElement('div');
    closeButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="${isDarkMode ? '#4e4f50' : '#e4e6eb'}"/>
            <path d="M15 9L9 15M9 9L15 15" stroke="${isDarkMode ? '#e4e6eb' : '#050505'}" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
    `;
    closeButton.style.cssText = `
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        margin-left: 8px;
    `;
    closeButton.onmouseover = () => {
        closeButton.style.backgroundColor = theme.hover;
    };
    closeButton.onmouseout = () => {
        closeButton.style.backgroundColor = 'transparent';
    };
    closeButton.onclick = () => priceContainer.remove();

    // Add header to container
    header.appendChild(title);
    header.appendChild(closeButton);
    priceContainer.appendChild(header);

    // Create content container with Facebook-like styling
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = `
        padding: 16px;
        font-size: 14px;
        line-height: 1.5;
    `;

    // Format the content with Facebook-like styling
    const formattedContent = kbbPrice.replace(/<div class="kbb-details".*?>/, '')
        .replace(/<\/div>$/, '')
        .replace(/<div class="car-info".*?>/, `
            <div style="background-color: ${theme.cardBackground}; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        `)
        .replace(/<div class="market-analysis".*?>/, `
            <div style="background-color: ${theme.cardBackground}; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        `)
        .replace(/<div class="maintenance-info".*?>/, `
            <div style="background-color: ${theme.cardBackground}; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        `)
        .replace(/<div class="resources".*?>/, `
            <div style="background-color: ${theme.cardBackground}; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        `)
        .replace(/<strong>/g, `<strong style="color: ${theme.text}; font-weight: 600;">`)
        .replace(/<a href/g, `<a style="color: ${theme.accent}; text-decoration: none; font-weight: 500;" href`)
        .replace(/• /g, `<span style="color: ${theme.accent}; margin-right: 4px;">•</span> `);

    contentDiv.innerHTML = formattedContent;
    priceContainer.appendChild(contentDiv);

    // Add Facebook-like footer
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 8px 16px;
        border-top: 1px solid ${theme.border};
        font-size: 12px;
        color: ${theme.secondaryText};
        text-align: center;
    `;
    footer.textContent = 'Values are estimates. Always verify pricing with multiple sources.';
    priceContainer.appendChild(footer);

    // Add to the body
    document.body.appendChild(priceContainer);

    // Make the container draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    header.addEventListener('mousedown', (e) => {
        if (e.target === closeButton || e.target.closest('svg')) return;
        isDragging = true;
        initialX = e.clientX - priceContainer.offsetLeft;
        initialY = e.clientY - priceContainer.offsetTop;
        header.style.cursor = 'grabbing';
    }, { passive: true });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        // Ensure the container stays within viewport bounds
        const bounds = {
            left: 0,
            top: 0,
            right: window.innerWidth - priceContainer.offsetWidth,
            bottom: window.innerHeight - priceContainer.offsetHeight
        };

        currentX = Math.min(Math.max(currentX, bounds.left), bounds.right);
        currentY = Math.min(Math.max(currentY, bounds.top), bounds.bottom);

        priceContainer.style.left = `${currentX}px`;
        priceContainer.style.top = `${currentY}px`;
        priceContainer.style.right = 'auto';
    }, { passive: false });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            header.style.cursor = 'grab';
        }
    }, { passive: true });

    // Set header cursor to indicate draggability
    header.style.cursor = 'grab';

    // Add a subtle animation
    setTimeout(() => {
        priceContainer.style.opacity = '0';
        priceContainer.style.transform = 'translateY(-20px)';
        
        setTimeout(() => {
            priceContainer.style.opacity = '1';
            priceContainer.style.transform = 'translateY(0)';
        }, 50);
    }, 0);

    return true;
}

// Main function with cleaner logging
async function main() {
    console.log("Extension started");
    
    try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const carDetails = extractCarDetails();
        if (carDetails) {
            console.log("Car details found:", {
                year: carDetails.year,
                make: carDetails.make,
                model: carDetails.model,
                mileage: carDetails.mileage,
                price: carDetails.price
            });
            
            const kbbPrice = await getKBBPrice(carDetails);
            injectKBBPrice(kbbPrice);
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

// URL change detection with cleaner logging
let lastUrl = location.href;
const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (location.href.includes('/marketplace/item/')) {
            main();
        }
    }
});

// Start observing with error handling
try {
    observer.observe(document, { subtree: true, childList: true });
    if (location.href.includes('/marketplace/item/')) {
        main();
    }
} catch (error) {
    console.error("Observer error:", error.message);
}

// Initialize
injectHelperScript();

// Add this helper function to clean up text
function cleanText(text) {
    return text.trim().replace(/\s+/g, ' ');
} 