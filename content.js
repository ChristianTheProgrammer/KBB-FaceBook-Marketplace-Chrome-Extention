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
    console.log("Starting price extraction...");

    // First try: Look for the main price display
    const mainPriceElement = document.querySelector('h1 + div');
    if (mainPriceElement) {
        const priceText = mainPriceElement.textContent.trim();
        console.log("Main price element text:", priceText);
        const mainMatch = priceText.match(/\$?([\d,]+)/);
        if (mainMatch) {
            const price = parseInt(mainMatch[1].replace(/,/g, ''));
            console.log("Found price from main element:", price);
            return price;
        }
    }

    // Second try: Look for specific price elements
    const priceSelectors = [
        '[aria-label="Price"]',
        'span[class*="price"]',
        'div[class*="price"]',
        'h1 + div', // Price often appears right after the title
        'span.f2', // Facebook's common price class
    ];

    console.log("Trying price selectors...");
    for (const selector of priceSelectors) {
        const elements = document.querySelectorAll(selector);
        console.log(`Found ${elements.length} elements for selector: ${selector}`);
        
        for (const element of elements) {
            const text = element.textContent.trim();
            console.log(`Element text: "${text}"`);
            
            // Look for price patterns: $X,XXX or $XXX,XXX or $XXXX
            const priceMatch = text.match(/\$\s*([\d,]+)/);
            if (priceMatch) {
                const price = parseInt(priceMatch[1].replace(/,/g, ''));
                console.log("Found price:", price);
                return price;
            }
        }
    }

    // Third try: Search all spans for price format
    console.log("Searching all spans...");
    const allSpans = document.querySelectorAll('span');
    for (const span of allSpans) {
        const text = span.textContent.trim();
        if (text.includes('$')) {
            console.log("Found span with $:", text);
            const priceMatch = text.match(/\$\s*([\d,]+)/);
            if (priceMatch) {
                const price = parseInt(priceMatch[1].replace(/,/g, ''));
                console.log("Found price from span:", price);
                return price;
            }
        }
    }

    // Fourth try: Look for price in the page title
    const title = document.title;
    console.log("Page title:", title);
    const titleMatch = title.match(/\$\s*([\d,]+)/);
    if (titleMatch) {
        const price = parseInt(titleMatch[1].replace(/,/g, ''));
        console.log("Found price from title:", price);
        return price;
    }

    console.log("No price found");
    return null;
}

// Enhanced mileage extraction
function extractMileage() {
    // Log all potential mileage elements
    console.log("=== Mileage Debug ===");
    const allElements = document.querySelectorAll('span, div');
    const potentialMileage = Array.from(allElements)
        .map(el => el.textContent.trim())
        .filter(text => /miles|mi|km|mileage/i.test(text));
    console.log("Potential mileage texts:", potentialMileage);

    for (const text of potentialMileage) {
        const match = text.match(/(\d+(?:,\d+)?(?:k)?)\s*(?:miles|mi\.?|mileage)/i);
        if (match) {
            let mileage = match[1].replace(/,/g, '');
            if (mileage.toLowerCase().endsWith('k')) {
                mileage = parseFloat(mileage) * 1000;
            }
            return Math.round(parseFloat(mileage));
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
    
    // Format the KBB URL
    const kbbBaseUrl = 'https://www.kbb.com/';
    const makeFormatted = carDetails.make.toLowerCase().replace(/\s+/g, '-');
    const modelFormatted = carDetails.model.toLowerCase().replace(/\s+/g, '-');
    
    // Construct KBB URL with proper model naming
    let kbbUrl = `${kbbBaseUrl}${makeFormatted}/`;
    if (modelFormatted === '3') {
        kbbUrl += '3-series/';
    } else if (modelFormatted === 'x1') {
        kbbUrl += 'x1/';
    } else {
        kbbUrl += `${modelFormatted}/`;
    }
    kbbUrl += `${carDetails.year}/`;

    // Calculate vehicle age
    const currentYear = new Date().getFullYear();
    const vehicleAge = currentYear - carDetails.year;
    
    // Create detailed response HTML
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
                • Vehicle Age: ${vehicleAge} years
            </div>

            <div class="resources" style="margin-top: 15px;">
                <strong>Research Tools:</strong><br>
                <a href="${kbbUrl}" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ Check KBB Price
                </a>
                <a href="https://www.edmunds.com/bmw/${modelFormatted}/${carDetails.year}/" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ Edmunds Appraisal
                </a>
                <a href="https://www.nadaguides.com/Cars/${carDetails.year}/BMW/${modelFormatted}" target="_blank" style="color: #2d5b7b; display: block; margin: 5px 0;">
                    ➤ NADA Guides
                </a>
            </div>

            <div style="font-size: 11px; color: #666; margin-top: 10px;">
                Note: Values are estimates. Always verify pricing with multiple sources.
            </div>
        </div>
    `;
    
    return response;
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

// Modified main function with better logging
async function main() {
    console.log("Extension main function started");
    
    // Initial delay to let Facebook load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try multiple times with increasing delays
    for (let i = 0; i < 5; i++) {
        console.log(`\n=== Attempt ${i + 1} to extract details ===`);
        
        // Test price extraction separately
        const price = extractPrice();
        console.log("Extracted price:", price);
        
        const carDetails = extractCarDetails();
        if (carDetails) {
            console.log("Successfully extracted car details:", carDetails);
            const kbbPrice = await getKBBPrice(carDetails);
            const injected = injectKBBPrice(kbbPrice);
            
            if (injected) {
                console.log("Successfully injected KBB information");
                return;
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

// URL change detection
let lastUrl = location.href;
const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
        console.log("URL changed from", lastUrl, "to", location.href);
        lastUrl = location.href;
        if (location.href.includes('/marketplace/item/')) {
            console.log("Detected car listing page, running main function");
            main();
        }
    }
});

// Start observing
observer.observe(document, { subtree: true, childList: true });

// Initial run
if (location.href.includes('/marketplace/item/')) {
    console.log("Initial page is a car listing, running main function");
    main();
}

// Initialize
injectHelperScript(); 