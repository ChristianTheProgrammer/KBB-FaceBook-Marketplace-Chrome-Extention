# KBB Facebook Marketplace Price Checker

This Chrome extension adds Kelly Blue Book (KBB) price information to Facebook Marketplace car listings.

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the folder containing these files
5. The extension should now appear in your Chrome toolbar

## Usage

1. Go to Facebook Marketplace
2. Browse to any car listing
3. The extension will automatically add KBB price information below the listing price

## Important Notes

- This is a basic implementation that provides a link to KBB's website for the specific car
- To get actual KBB prices, you would need to:
  - Partner with KBB to use their official API
  - Or use a third-party service that provides KBB data
  - Or implement web scraping (carefully considering legal/terms of service implications)

## Features

- Automatically detects car year, make, and model from listing title
- Extracts mileage information when available
- Updates when browsing different listings without requiring page refresh
- Clean, unobtrusive UI that matches Facebook's style

## Limitations

- Requires clear listing titles with year, make, and model in standard format
- Does not provide actual KBB prices (would require API access)
- May not work if Facebook significantly changes their page structure

## Contributing

Feel free to submit issues and enhancement requests! 