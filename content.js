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
    console.debug("Generating KBB information for:", carDetails);
    
    // Format URLs and search parameters
    const makeEncoded = encodeURIComponent(carDetails.make);
    const modelEncoded = encodeURIComponent(carDetails.model);
    const yearEncoded = encodeURIComponent(carDetails.year);
    const fullModelName = `${carDetails.year} ${carDetails.make} ${carDetails.model}`;
    const zipCode = '60601'; // Default to Chicago

    // Construct specific URLs for each service
    const urls = {
        // KBB URL with specific model handling
        kbb: (() => {
            let url = `https://www.kbb.com/${carDetails.make.toLowerCase().replace(/\s+/g, '-')}/`;
            if (carDetails.make === 'BMW') {
                switch(carDetails.model.toLowerCase()) {
                    case '3': return `https://www.kbb.com/bmw/3-series/${carDetails.year}/`;
                    case '5': return `https://www.kbb.com/bmw/5-series/${carDetails.year}/`;
                    case 'x1': return `https://www.kbb.com/bmw/x1/${carDetails.year}/`;
                    case 'x3': return `https://www.kbb.com/bmw/x3/${carDetails.year}/`;
                    case 'x5': return `https://www.kbb.com/bmw/x5/${carDetails.year}/`;
                    default: url += `${carDetails.model.toLowerCase().replace(/\s+/g, '-')}/${carDetails.year}/`;
                }
            } else {
                url += `${carDetails.model.toLowerCase().replace(/\s+/g, '-')}/${carDetails.year}/`;
            }
            return url;
        })(),
        carfax: `https://www.carfax.com/vehicle/${carDetails.year}/${makeEncoded}/${modelEncoded}`,
        edmunds: `https://www.edmunds.com/${carDetails.make.toLowerCase().replace(/\s+/g, '-')}/${carDetails.model.toLowerCase().replace(/\s+/g, '-')}/${carDetails.year}/review/`,
        carsCom: `https://www.cars.com/shopping/results/?dealer_id=&keyword=${encodeURIComponent(fullModelName)}&list_price_max=${Math.ceil(carDetails.price * 1.2)}&list_price_min=${Math.floor(carDetails.price * 0.8)}&maximum_distance=100&stock_type=used&zip=${zipCode}`
    };

    // Calculate various metrics
    const currentYear = new Date().getFullYear();
    const vehicleAge = currentYear - carDetails.year;
    const expectedMileage = vehicleAge * 12000; // Industry standard
    const mileageDifference = carDetails.mileage - expectedMileage;
    
    // Create detailed response HTML
    const response = `
        <div class="kbb-details">
            <div class="car-info">
                <strong>Vehicle Details:</strong><br>
                ${carDetails.year} ${carDetails.make} ${carDetails.model} ${carDetails.trim}<br>
                ${carDetails.mileage ? `Mileage: ${carDetails.mileage.toLocaleString()} miles<br>` : ''}
                ${carDetails.price ? `Listed Price: $${carDetails.price.toLocaleString()}` : 'Price: Not listed'}
            </div>
            
            <div class="market-analysis">
                <strong>Market Analysis:</strong><br>
                • Vehicle Age: ${vehicleAge} years<br>
                • Expected Mileage: ${expectedMileage.toLocaleString()} miles<br>
                • Mileage Difference: ${mileageDifference > 0 ? '+' : ''}${mileageDifference.toLocaleString()} miles
            </div>

            <div class="resources">
                <strong>Research Tools:</strong><br>
                <a href="${urls.kbb}" target="_blank">
                    ➤ Kelly Blue Book Value
                </a><br>
                <a href="${urls.carfax}" target="_blank">
                    ➤ CARFAX History Report
                </a><br>
                <a href="${urls.edmunds}" target="_blank">
                    ➤ Edmunds Expert Review
                </a><br>
                <a href="${urls.carsCom}" target="_blank">
                    ➤ Similar Cars for Sale
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
    title.textContent = 'Kelly Blue Book Information';
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