// Utility functions first
// Debounce helper function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Clean text helper
function cleanText(text) {
    return text.trim().replace(/\s+/g, ' ');
}

// Suppress third-party cookie warnings
const originalConsoleWarn = console.warn;
console.warn = function(...args) {
    if (args[0]?.includes('third-party cookie')) return;
    if (args[0]?.includes('googletagmanager')) return;
    originalConsoleWarn.apply(console, args);
};

// Function to inject our helper script with security improvements
function injectHelperScript() {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('inject.js');
        script.onload = function() {
            this.remove();
        };
        // Add security attributes
        script.setAttribute('nonce', '');  // CSP nonce
        script.setAttribute('crossorigin', 'anonymous');
        (document.head || document.documentElement).appendChild(script);
    } catch (error) {
        console.error('Failed to inject helper script:', error);
    }
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

// Cache management with size limit and expiration
const carDetailsCache = {
    data: new Map(),
    maxSize: 100,
    expirationTime: 30 * 60 * 1000, // 30 minutes
    
    set(key, value) {
        if (this.data.size >= this.maxSize) {
            const oldestKey = this.data.keys().next().value;
            this.data.delete(oldestKey);
        }
        this.data.set(key, {
            value,
            timestamp: Date.now()
        });
    },
    
    get(key) {
        const item = this.data.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > this.expirationTime) {
            this.data.delete(key);
            return null;
        }
        return item.value;
    },
    
    has(key) {
        return this.get(key) !== null;
    },
    
    clear() {
        this.data.clear();
    }
};

// Rate limiting helper
const rateLimiter = {
    lastCall: 0,
    minInterval: 1000,
    canMakeCall() {
        const now = Date.now();
        if (now - this.lastCall >= this.minInterval) {
            this.lastCall = now;
            return true;
        }
        return false;
    }
};

// User preferences management
const userPreferences = {
    async load() {
        try {
            const stored = await chrome.storage.local.get('kbbPreferences');
            return stored.kbbPreferences || {};
        } catch (e) {
            console.error('Error loading preferences:', e);
            return {};
        }
    },
    
    async save(prefs) {
        try {
            await chrome.storage.local.set({ kbbPreferences: prefs });
        } catch (e) {
            console.error('Error saving preferences:', e);
        }
    }
};

// Improved dark mode detection
function isDarkMode() {
    return document.documentElement.classList.contains('__fb-dark-mode') || 
           document.body.classList.contains('__fb-dark-mode') ||
           document.querySelector('body[class*="dark"]') !== null ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Retry logic for failed extractions
async function retryOperation(operation, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Enhanced error messages with suggestions
function getErrorMessageWithSuggestion(error) {
    const errorMessages = {
        'Could not extract car details': {
            message: 'Unable to find car details in the listing',
            suggestion: 'Make sure you\'re on a car listing page and the title contains year, make, and model'
        },
        'Rate limit exceeded': {
            message: 'Too many requests',
            suggestion: 'Please wait a moment before checking another listing'
        },
        default: {
            message: 'An error occurred',
            suggestion: 'Try refreshing the page or checking another listing'
        }
    };

    const errorType = Object.keys(errorMessages).find(key => error.includes(key)) || 'default';
    return errorMessages[errorType];
}

// Keyboard shortcuts handler
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Alt + K to toggle the KBB price container
        if (e.altKey && e.key.toLowerCase() === 'k') {
            const container = document.getElementById('kbb-price-container');
            if (container) {
                container.style.display = container.style.display === 'none' ? 'block' : 'none';
            }
        }
        
        // Alt + R to refresh the data
        if (e.altKey && e.key.toLowerCase() === 'r') {
            carDetailsCache.clear();
            main();
        }
    });
}

// Add tooltips to UI elements
function addTooltip(element, text) {
    element.title = text;
    element.setAttribute('data-tooltip', text);
    element.style.position = 'relative';
    
    element.addEventListener('mouseenter', (e) => {
        const tooltip = document.createElement('div');
        tooltip.className = 'kbb-tooltip';
        tooltip.textContent = text;
        element.appendChild(tooltip);
    });
    
    element.addEventListener('mouseleave', () => {
        const tooltip = element.querySelector('.kbb-tooltip');
        if (tooltip) tooltip.remove();
    });
}

// Function to show loading state
function showLoadingState() {
    const loadingContainer = document.createElement('div');
    loadingContainer.id = 'kbb-loading';
    loadingContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: white;
        padding: 10px 20px;
        border-radius: 20px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
        z-index: 9999;
        font-family: Helvetica, Arial, sans-serif;
    `;
    loadingContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div class="loading-spinner"></div>
            <span>Loading market data...</span>
        </div>
    `;
    document.body.appendChild(loadingContainer);
    return loadingContainer;
}

// Function to show error message
function showErrorMessage(message) {
    const errorContainer = document.createElement('div');
    errorContainer.id = 'kbb-error';
    errorContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #ffebee;
        padding: 10px 20px;
        border-radius: 20px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
        z-index: 9999;
        font-family: Helvetica, Arial, sans-serif;
        color: #c62828;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    errorContainer.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <span>${message}</span>
    `;
    document.body.appendChild(errorContainer);
    setTimeout(() => errorContainer.remove(), 5000);
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
        // Adding more makes with specific patterns
        Lexus: /^([A-Z]{2,3}\d*(?:\s?[FSh])?)\s*(.*?)$/i,  // For models like IS350, RX350, ES300h
        Infiniti: /^([QGJ][A-Z]?\d+x?)\s*(.*?)$/i,  // For models like Q50, QX60, G37
        Volkswagen: /^((?:Golf|Jetta|Passat|Atlas|Tiguan|ID\d?))\s*(.*?)$/i,
        Porsche: /^((?:911|Cayenne|Macan|Panamera|Boxster|Cayman))\s*(.*?)$/i,
        Chevrolet: /^((?:Malibu|Cruze|Equinox|Silverado|Tahoe|Corvette))\s*(.*?)$/i,
        Ford: /^((?:F-?\d{3}|Mustang|Explorer|Escape|Focus|Fusion))\s*(.*?)$/i,
        Hyundai: /^((?:Elantra|Sonata|Tucson|Santa Fe|Kona|Palisade))\s*(.*?)$/i,
        Kia: /^((?:Forte|Optima|Sorento|Telluride|Soul|Sportage))\s*(.*?)$/i,
        Subaru: /^((?:Impreza|Legacy|Outback|Forester|Crosstrek|WRX))\s*(.*?)$/i,
        Nissan: /^((?:Altima|Maxima|Rogue|Murano|Pathfinder|[GZ]-?TR?))\s*(.*?)$/i,
        Acura: /^([A-Z]{2,3}[X]?)\s*(.*?)$/i,  // For models like MDX, RDX, TLX
        // Default pattern remains the same
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

    // Create banner container
    const bannerContainer = document.createElement('div');
    bannerContainer.id = 'kbb-price-container';
    bannerContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: ${theme.background};
        border-radius: 20px;
        box-shadow: 0 2px 12px ${theme.shadow};
        z-index: 9999;
        font-family: Helvetica, Arial, sans-serif;
        color: ${theme.text};
        transition: all 0.3s ease;
        border: 1px solid ${theme.border};
        width: auto;
    `;

    // Create collapsed pill view
    const collapsedPill = document.createElement('div');
    collapsedPill.style.cssText = `
        display: flex;
        align-items: center;
        padding: 8px 16px;
        cursor: pointer;
        gap: 8px;
        white-space: nowrap;
    `;

    // Add icon and minimal text to pill
    collapsedPill.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${theme.accent}">
            <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.7L20 9l-8 4-8-4 8-4.3z"/>
        </svg>
        <span style="font-size: 13px; font-weight: 600;">Market Info</span>
    `;

    bannerContainer.appendChild(collapsedPill);

    // Create expandable content container
    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = `
        max-height: 0;
        overflow: hidden;
        transition: all 0.3s ease;
        width: 0;
        opacity: 0;
    `;
    contentContainer.innerHTML = kbbPrice;
    bannerContainer.appendChild(contentContainer);

    // Toggle expansion on click
    let isExpanded = false;
    collapsedPill.onclick = () => {
        isExpanded = !isExpanded;
        if (isExpanded) {
            bannerContainer.style.width = '340px';
            contentContainer.style.maxHeight = '70vh';
            contentContainer.style.width = '100%';
            contentContainer.style.opacity = '1';
            contentContainer.style.padding = '16px';
            bannerContainer.style.borderRadius = '8px';
            collapsedPill.style.borderBottom = `1px solid ${theme.border}`;
        } else {
            bannerContainer.style.width = 'auto';
            contentContainer.style.maxHeight = '0';
            contentContainer.style.width = '0';
            contentContainer.style.opacity = '0';
            contentContainer.style.padding = '0';
            bannerContainer.style.borderRadius = '20px';
            collapsedPill.style.borderBottom = 'none';
        }
    };

    // Add hover effect
    collapsedPill.onmouseover = () => {
        bannerContainer.style.transform = 'translateY(-2px)';
        bannerContainer.style.boxShadow = `0 4px 16px ${theme.shadow}`;
    };
    collapsedPill.onmouseout = () => {
        bannerContainer.style.transform = 'translateY(0)';
        bannerContainer.style.boxShadow = `0 2px 12px ${theme.shadow}`;
    };

    // Make the banner draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    collapsedPill.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() === 'a') return; // Don't drag when clicking links
        isDragging = true;
        initialX = e.clientX - bannerContainer.offsetLeft;
        initialY = e.clientY - bannerContainer.offsetTop;
    }, { passive: true });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        const bounds = {
            left: 0,
            top: 0,
            right: window.innerWidth - bannerContainer.offsetWidth,
            bottom: window.innerHeight - bannerContainer.offsetHeight
        };

        currentX = Math.min(Math.max(currentX, bounds.left), bounds.right);
        currentY = Math.min(Math.max(currentY, bounds.top), bounds.bottom);

        bannerContainer.style.left = `${currentX}px`;
        bannerContainer.style.top = `${currentY}px`;
        bannerContainer.style.right = 'auto';
    }, { passive: false });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    }, { passive: true });

    // Add entrance animation
    bannerContainer.style.opacity = '0';
    bannerContainer.style.transform = 'translateY(-20px)';
    
    setTimeout(() => {
        bannerContainer.style.opacity = '1';
        bannerContainer.style.transform = 'translateY(0)';
    }, 50);

    // Add to the body
    document.body.appendChild(bannerContainer);

    return true;
}

// Update main function with retry logic and enhanced error handling
async function main() {
    console.log("Extension started");
    
    try {
        const loadingIndicator = showLoadingState();
        
        // Load user preferences
        const prefs = await userPreferences.load();
        
        // Check cache first
        const currentUrl = location.href;
        if (carDetailsCache.has(currentUrl)) {
            const cachedDetails = carDetailsCache.get(currentUrl);
            injectKBBPrice(cachedDetails);
            loadingIndicator.remove();
            return;
        }

        const carDetails = await retryOperation(async () => {
            const details = extractCarDetails();
            if (!details) throw new Error("Could not extract car details");
            return details;
        });

        if (!rateLimiter.canMakeCall()) {
            throw new Error("Rate limit exceeded");
        }

        const kbbPrice = await getKBBPrice(carDetails);
        carDetailsCache.set(currentUrl, kbbPrice);
        injectKBBPrice(kbbPrice);
        loadingIndicator.remove();

    } catch (error) {
        console.error("Error:", error.message);
        const { message, suggestion } = getErrorMessageWithSuggestion(error.message);
        showErrorMessage(`${message}. ${suggestion}`);
    }
}

// Initialize with proper error handling
async function initialize() {
    try {
        setupKeyboardShortcuts();
        injectHelperScript();
        
        // Set up observer with error handling
        const observer = new MutationObserver(debounce(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                if (location.href.includes('/marketplace/item/')) {
                    main();
                }
            }
        }, 500));

        observer.observe(document, { 
            subtree: true, 
            childList: true,
            attributes: false,
            characterData: false
        });

        // Initial check
        if (location.href.includes('/marketplace/item/')) {
            main();
        }
    } catch (error) {
        console.error('Initialization error:', error);
        showErrorMessage('Failed to initialize extension. Please refresh the page.');
    }
}

// Start the extension
let lastUrl = location.href;
initialize(); 