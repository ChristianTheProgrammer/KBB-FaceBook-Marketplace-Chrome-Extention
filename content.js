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
    console.log("Attempting to extract car details...");
    
    // Debug log the DOM structure
    debugLogDOMStructure();
    
    // Try to find any element containing car-like information
    const allElements = document.querySelectorAll('h1, h2, h3, span, div');
    const carElement = Array.from(allElements).find(el => {
        const text = el.textContent.trim();
        // Look for any text that matches a year followed by words
        return /\d{4}\s+[A-Za-z]/.test(text) && text.length < 100;
    });

    if (carElement) {
        console.log("Found potential car element:", carElement);
        console.log("Text content:", carElement.textContent);
    }

    // If we found a potential car element, try to extract details
    if (carElement) {
        const title = carElement.textContent.trim();
        const carRegex = /(\d{4})\s+([\w-]+)(?:\s+|-)([\w]+)(?:\s+([\w-]+))?/i;
        const match = title.match(carRegex);
        
        if (match) {
            return {
                year: match[1],
                make: match[2].replace(/-/g, ' '),
                model: match[3],
                trim: match[4] || '',
                mileage: extractMileage(),
                price: extractPrice()
            };
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

    // Get all text elements that might contain mileage information
    const elements = document.querySelectorAll('div, span');
    
    for (const element of elements) {
        const text = element.textContent.trim();
        
        // Skip empty text or very long text
        if (!text || text.length > 200) continue;
        
        // Only log text that contains numbers and "mile"
        if (text.match(/\d+.*mile/i)) {
            console.debug(`Checking mileage text: "${text}"`);
        }
        
        // Try different mileage patterns
        const patterns = [
            /Driven\s+([\d,]+)\s*miles/i,
            /([\d,]+)\s*miles/i,
            /(\d+[,.]?\d*k?)\s*(?:miles|mi)/i,
            /mileage:\s*([\d,]+)/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                let mileage = match[1].replace(/,/g, '');
                if (mileage.toLowerCase().endsWith('k')) {
                    mileage = parseFloat(mileage) * 1000;
                }
                const result = parseInt(mileage);
                console.debug(`Found mileage: ${result}`);
                return result;
            }
        }
    }

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

// Function to create KBB URL and price estimate
async function getKBBPrice(carDetails) {
    console.log("Generating KBB information for:", carDetails);
    
    // Format URLs and search parameters
    const kbbBaseUrl = 'https://www.kbb.com/';
    const makeFormatted = carDetails.make.toLowerCase().replace(/\s+/g, '-');
    const modelFormatted = carDetails.model.toLowerCase().replace(/\s+/g, '-');
    const yearEncoded = encodeURIComponent(carDetails.year);
    const fullModelName = `${carDetails.year} ${carDetails.make} ${carDetails.model}`;
    const zipCode = '60601'; // Default to Chicago

    // Construct specific URLs for each service
    const urls = {
        // KBB URL with specific model handling
        kbb: (() => {
            let url = `${kbbBaseUrl}${makeFormatted}/`;
            if (carDetails.make === 'BMW') {
                switch(modelFormatted) {
                    case '3': return `${kbbBaseUrl}bmw/3-series/${carDetails.year}/`;
                    case '5': return `${kbbBaseUrl}bmw/5-series/${carDetails.year}/`;
                    case 'x1': return `${kbbBaseUrl}bmw/x1/${carDetails.year}/`;
                    case 'x3': return `${kbbBaseUrl}bmw/x3/${carDetails.year}/`;
                    default: url += `${modelFormatted}/${carDetails.year}/`;
                }
            } else {
                url += `${modelFormatted}/${carDetails.year}/`;
            }
            return url;
        })(),

        // Edmunds with specific model search
        edmunds: `https://www.edmunds.com/${makeFormatted}/${modelFormatted}/${carDetails.year}/review/`,
        
        // CARFAX direct VIN search and history report
        carfax: `https://www.carfax.com/vehicle/${carDetails.year}/${encodeURIComponent(carDetails.make)}/${encodeURIComponent(carDetails.model)}`,
        
        // Cars.com market comparison
        carsCom: `https://www.cars.com/shopping/results/?dealer_id=&keyword=${encodeURIComponent(fullModelName)}&list_price_max=${Math.ceil(carDetails.price * 1.2)}&list_price_min=${Math.floor(carDetails.price * 0.8)}&maximum_distance=100&stock_type=used&zip=${zipCode}`,

        // RepairPal maintenance costs and reliability
        repairPal: `https://repairpal.com/cars/${makeFormatted}/${modelFormatted}/${carDetails.year}`,
        
        // Consumer Reports (if available)
        consumerReports: `https://www.consumerreports.org/cars/${makeFormatted}/${modelFormatted}/${carDetails.year}/`,

        // AutoTempest (aggregates multiple listing sites)
        autoTempest: `https://www.autotempest.com/results?make=${encodeURIComponent(carDetails.make)}&model=${encodeURIComponent(carDetails.model)}&year=${yearEncoded}&zip=${zipCode}&radius=100`,
        
        // YouTube reviews search
        youtubeReviews: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${carDetails.year} ${carDetails.make} ${carDetails.model} review`)}`,
    };

    // Create the research tools section with improved organization
    const researchToolsHtml = `
        <div class="resources" style="margin-top: 15px;">
            <strong>Research Tools:</strong>
            
            <div style="margin: 10px 0;">
                <strong style="color: #666; font-size: 13px;">Price Comparison:</strong><br>
                <a href="${urls.kbb}" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ Kelly Blue Book Value
                </a>
                <a href="${urls.carsCom}" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ Similar Cars for Sale
                </a>
                <a href="${urls.autoTempest}" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ Search All Sites
                </a>
            </div>

            <div style="margin: 10px 0;">
                <strong style="color: #666; font-size: 13px;">Vehicle History & Reliability:</strong><br>
                <a href="${urls.carfax}" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ CARFAX History Report
                </a>
                <a href="${urls.repairPal}" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ Maintenance Costs & Reliability
                </a>
            </div>

            <div style="margin: 10px 0;">
                <strong style="color: #666; font-size: 13px;">Reviews & Research:</strong><br>
                <a href="${urls.edmunds}" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ Edmunds Expert Review
                </a>
                <a href="${urls.youtubeReviews}" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ Video Reviews
                </a>
                <a href="${urls.consumerReports}" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ Consumer Reports
                </a>
            </div>
        </div>
    `;

    // Update your existing response HTML to include the new research tools section
    const response = `
        <div class="kbb-details" style="font-family: Arial, sans-serif;">
            <div class="car-info" style="margin-bottom: 12px;">
                <strong>Vehicle Details:</strong><br>
                ${carDetails.year} ${carDetails.make} ${carDetails.model} ${carDetails.trim}<br>
                ${carDetails.mileage ? `Mileage: ${carDetails.mileage.toLocaleString()} miles<br>` : ''}
                ${carDetails.price ? `Listed Price: $${carDetails.price.toLocaleString()}` : 'Price: Not listed'}
            </div>
            
            <div class="market-analysis" style="margin-bottom: 12px;">
                <strong>Market Analysis:</strong><br>
                • Vehicle Age: ${new Date().getFullYear() - parseInt(carDetails.year)} years<br>
                • Expected Mileage: ${Math.round(parseInt(carDetails.mileage) * 1.2)} miles<br>
                • Mileage Difference: ${Math.round(parseInt(carDetails.mileage) * 0.2)} miles<br>
                ${carDetails.price ? `• Price per Year of Age: $${Math.round(carDetails.price/parseInt(carDetails.year)).toLocaleString()}<br>` : ''}
            </div>

            <div class="maintenance-info" style="margin-bottom: 12px;">
                <strong>Maintenance & Reliability:</strong><br>
                • Major Service Interval: ${getMajorServiceInterval(carDetails.make)}<br>
                • Common Issues: ${getCommonIssues(carDetails.make, carDetails.model)}<br>
                • Next Major Service: ${getNextMajorService(parseInt(carDetails.mileage), carDetails.make)}
            </div>

            ${researchToolsHtml}

            <div style="font-size: 11px; color: #666; margin-top: 10px;">
                Note: Values are estimates. Always verify information with multiple sources.
            </div>
        </div>
    `;
    
    return response;
}

// Helper function for major service intervals
function getMajorServiceInterval(make) {
    const intervals = {
        'BMW': '10,000 miles or 1 year',
        'Mercedes-Benz': '10,000 miles or 1 year',
        'Audi': '10,000 miles or 1 year',
        'Toyota': '5,000-7,500 miles or 6 months',
        'Honda': '7,500 miles or 1 year',
        // Add more makes as needed
        'default': '7,500 miles or 1 year'
    };
    return intervals[make] || intervals['default'];
}

// Helper function for common issues
function getCommonIssues(make, model) {
    const issues = {
        'BMW': {
            '3': 'Oil leaks, Cooling system, Electric window regulators',
            'X1': 'Timing chain, Oil leaks, Suspension components',
            'default': 'Oil leaks, Electrical systems'
        },
        'default': 'Check maintenance history and get pre-purchase inspection'
    };
    return issues[make]?.[model] || issues[make]?.['default'] || issues['default'];
}

// Helper function to calculate next major service
function getNextMajorService(mileage, make) {
    if (!mileage) return 'Unknown - mileage not provided';
    
    const serviceIntervals = {
        'BMW': 10000,
        'Mercedes-Benz': 10000,
        'Audi': 10000,
        'Toyota': 5000,
        'Honda': 7500,
        'default': 7500
    };
    
    const interval = serviceIntervals[make] || serviceIntervals['default'];
    const nextService = Math.ceil(mileage / interval) * interval;
    return `${nextService.toLocaleString()} miles`;
}

// Function to inject KBB price into the page
function injectKBBPrice(kbbPrice) {
    console.log("Attempting to inject KBB price information...");

    // Remove any existing KBB container
    const existingContainer = document.getElementById('kbb-price-container');
    if (existingContainer) {
        existingContainer.remove();
    }

    // Create new container
    const priceContainer = document.createElement('div');
    priceContainer.id = 'kbb-price-container';
    priceContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 300px;
        background-color: white;
        padding: 16px;
        border-radius: 8px;
        border: 1px solid #ddd;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 9999;
        max-height: 80vh;
        overflow-y: auto;
        font-family: Arial, sans-serif;
        color: #1c1e21;
        touch-action: pan-y pinch-zoom;
    `;

    // Add a close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        padding: 5px;
        color: #65676B;
    `;
    closeButton.onclick = () => priceContainer.remove();

    // Create content container
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = kbbPrice;

    // Assemble the container
    priceContainer.appendChild(closeButton);
    priceContainer.appendChild(contentDiv);

    // Add to the body
    document.body.appendChild(priceContainer);

    // Make the container draggable with passive event listeners
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    const dragStart = (e) => {
        if (e.target === closeButton) return;
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - priceContainer.offsetLeft;
            initialY = e.touches[0].clientY - priceContainer.offsetTop;
        } else {
            initialX = e.clientX - priceContainer.offsetLeft;
            initialY = e.clientY - priceContainer.offsetTop;
        }
        isDragging = true;
    };

    const dragEnd = () => {
        isDragging = false;
    };

    const drag = (e) => {
        if (!isDragging) return;
        e.preventDefault();

        if (e.type === "touchmove") {
            currentX = e.touches[0].clientX - initialX;
            currentY = e.touches[0].clientY - initialY;
        } else {
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
        }

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
    };

    // Add mouse event listeners
    priceContainer.addEventListener('mousedown', dragStart, { passive: true });
    document.addEventListener('mousemove', drag, { passive: false });
    document.addEventListener('mouseup', dragEnd, { passive: true });

    // Add touch event listeners with passive option
    priceContainer.addEventListener('touchstart', dragStart, { passive: true });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', dragEnd, { passive: true });

    // Add hover effect to indicate draggability
    priceContainer.style.cursor = 'move';

    console.log("KBB information injected as floating container");
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