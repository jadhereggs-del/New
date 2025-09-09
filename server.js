const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const app = express();
const PORT = 5000;

// ImageKit configuration - Add your credentials here
const IMAGEKIT_CONFIG = {
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || 'public_2dRQAn3nHD2T8mMA+1PSq/dI7YY=',
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || 'private_z9X2+3JBNLxXUPHT/dWWwpClkis=',
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/vcziplvso'
};

// Configure multer for memory storage
const upload = multer({ 
    storage: multer.memoryStorage(),
    fileFilter: function (req, file, cb) {
        // Accept only image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Middleware
app.use(express.json());
app.use(express.static('.'));

// Data file path
const DATA_FILE = './products.json';

// Sync products with ImageKit on startup
async function syncWithImageKit() {
    try {
        const fetch = (await import('node-fetch')).default;
        const authString = `${IMAGEKIT_CONFIG.privateKey}:`;
        const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
        
        // Get all files from ImageKit
        const response = await fetch('https://api.imagekit.io/v1/files', {
            headers: {
                'Authorization': authHeader
            }
        });
        
        if (!response.ok) {
            console.warn('Failed to sync with ImageKit');
            return;
        }
        
        const imageKitFiles = await response.json();
        console.log(`Found ${imageKitFiles.length} files in ImageKit`);
        
        // Read current products
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const products = JSON.parse(data);
        
        // Update image URLs for existing products
        Object.keys(products).forEach(category => {
            products[category].forEach(product => {
                if (product.imageUrl) {
                    const filename = product.imageUrl.split('/').pop();
                    const imageKitFile = imageKitFiles.find(file => file.name === filename);
                    if (imageKitFile) {
                        product.imageUrl = `/api/images/${filename}`;
                    } else {
                        // Image not found in ImageKit, remove imageUrl
                        product.imageUrl = null;
                    }
                }
            });
        });
        
        // Save updated data
        await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));
        console.log('Synced products with ImageKit successfully');
        
    } catch (error) {
        console.warn('Error syncing with ImageKit:', error);
    }
}

// Initialize products data file if it doesn't exist
async function initializeData() {
    try {
        await fs.access(DATA_FILE);
        // File exists, sync with ImageKit
        await syncWithImageKit();
    } catch (error) {
        // File doesn't exist, create it with clean default data
        const defaultData = {
            fridges: [],
            'cloth-washers': [],
            acs: [],
            fans: [],
            'dish-washers': [],
            'water-dispensers': [],
            other: []
        };
        await fs.writeFile(DATA_FILE, JSON.stringify(defaultData, null, 2));
        console.log('Created clean products data file');
    }
}

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to read products' });
    }
});

// Serve images by proxying ImageKit URLs
app.get('/api/images/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        console.log('Getting images');
        console.log('Uploading them to their Place');
        const imageUrl = `${IMAGEKIT_CONFIG.urlEndpoint}/${filename}`;

        // Fetch image from ImageKit and proxy it
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(imageUrl);

        if (!response.ok) {
            return res.status(404).send('Image not found');
        }

        const imageBuffer = await response.buffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        
        console.log('Finishes');
        res.set('Content-Type', contentType);
        res.send(imageBuffer);
    } catch (error) {
        console.error('Error serving image:', error);
        res.status(404).send('Image not found');
    }
});

// Upload image endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded' });
        }
        
        // Get product details from form data
        const category = req.body.category || 'other';
        const productName = req.body.productName || 'Unknown';
        const price = req.body.price || '0';
        const description = req.body.description || 'No description';
        
        // Map category names to filename-friendly versions
        const categoryMap = {
            'fridges': 'fridge',
            'cloth-washers': 'clothwash',
            'acs': 'ac',
            'fans': 'fan',
            'dish-washers': 'dishwash',
            'water-dispensers': 'waterdispenser',
            'other': 'other'
        };
        
        const categoryPrefix = categoryMap[category] || 'other';
        
        // Clean strings for filename (use dashes for spaces, remove other special characters)
        const cleanName = productName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').substring(0, 20);
        const cleanPrice = price.replace(/[^0-9.]/g, '');
        const cleanDesc = description.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').substring(0, 30);

        // Generate filename with all details: category_name_price_description_timestamp.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = `${categoryPrefix}_${cleanName}_${cleanPrice}_${cleanDesc}_${uniqueSuffix}${path.extname(req.file.originalname)}`;

        console.log('Uploading to the web');
        console.log('Uploading to Imagekit');
        
        // Upload to ImageKit
        const fetch = (await import('node-fetch')).default;
        const FormData = (await import('form-data')).default;

        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: filename,
            contentType: req.file.mimetype
        });
        formData.append('fileName', filename);

        // Create authentication signature
        const authString = `${IMAGEKIT_CONFIG.privateKey}:`;
        const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

        const uploadResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                ...formData.getHeaders()
            },
            body: formData
        });

        const uploadResult = await uploadResponse.json();

        if (!uploadResponse.ok) {
            console.error('ImageKit upload error:', uploadResult);
            return res.status(500).json({ error: 'Failed to upload to ImageKit' });
        }

        console.log('Uploaded successfully');
        
        const imageUrl = `/api/images/${uploadResult.name}`;

        res.json({ 
            success: true, 
            imageUrl: imageUrl,
            filename: uploadResult.name
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// Add new product
app.post('/api/products', async (req, res) => {
    try {
        const { name, description, category, password, imageUrl, price } = req.body;

        // Verify password
        if (password !== '9890') {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        if (!name || !category) {
            return res.status(400).json({ error: 'Name and category are required' });
        }

        // Read current data
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const products = JSON.parse(data);

        // Generate new ID
        const newId = Math.floor(Math.random() * 9000) + 1000;

        // Add new product to category
        if (!products[category]) {
            products[category] = [];
        }

        const newProduct = {
            name: name,
            id: newId.toString(),
            description: description || '',
            imageUrl: imageUrl || null,
            price: price || null
        };

        products[category].push(newProduct);

        // Save updated data
        await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));

        res.json({ 
            success: true, 
            product: newProduct
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// Update product
app.put('/api/products', async (req, res) => {
    try {
        const { category, productId, name, description, price, imageUrl, password } = req.body;

        // Verify password
        if (password !== '9890') {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        if (!category || !productId || !name) {
            return res.status(400).json({ error: 'Category, product ID, and name are required' });
        }

        // Read current data
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const products = JSON.parse(data);

        // Find and update the product
        const productIndex = products[category].findIndex(product => product.id === productId);

        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Update product fields
        const updatedProduct = {
            ...products[category][productIndex],
            name: name,
            description: description || '',
            price: price || null
        };

        // Update image only if new one provided
        if (imageUrl) {
            updatedProduct.imageUrl = imageUrl;
        }

        products[category][productIndex] = updatedProduct;

        // Save updated data
        await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));

        res.json({ 
            success: true, 
            product: updatedProduct
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Remove product
app.delete('/api/products', async (req, res) => {
    try {
        const { category, productId, password } = req.body;

        // Verify password
        if (password !== '9890') {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        if (!category || !productId) {
            return res.status(400).json({ error: 'Category and product ID are required' });
        }

        // Read current data
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const products = JSON.parse(data);

        // Check if category exists
        if (!products[category] || !Array.isArray(products[category])) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Find and remove the product
        const productIndex = products[category].findIndex(product => product.id === productId);

        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const removedProduct = products[category][productIndex];
        
        // Delete image from ImageKit if it exists
        if (removedProduct.imageUrl) {
            try {
                console.log('Deleting image');
                const filename = removedProduct.imageUrl.split('/').pop();
                const fetch = (await import('node-fetch')).default;
                
                const authString = `${IMAGEKIT_CONFIG.privateKey}:`;
                const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
                
                // First get file ID from filename
                const listResponse = await fetch('https://api.imagekit.io/v1/files?name=' + encodeURIComponent(filename), {
                    headers: {
                        'Authorization': authHeader
                    }
                });
                
                if (listResponse.ok) {
                    const files = await listResponse.json();
                    if (files.length > 0) {
                        const fileId = files[0].fileId;
                        
                        // Now delete using the correct file ID
                        const deleteResponse = await fetch(`https://api.imagekit.io/v1/files/${fileId}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': authHeader
                            }
                        });
                        
                        if (!deleteResponse.ok) {
                            console.warn('Failed to delete image from ImageKit:', filename);
                        } else {
                            console.log('Deleted');
                        }
                    } else {
                        console.warn('File not found in ImageKit:', filename);
                    }
                } else {
                    console.warn('Failed to get file info from ImageKit:', filename);
                }
            } catch (imageError) {
                console.warn('Error deleting image from ImageKit:', imageError);
            }
        }

        products[category].splice(productIndex, 1);

        // Save updated data
        await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));

        res.json({ 
            success: true, 
            removedProduct: removedProduct,
            category: category
        });
    } catch (error) {
        console.error('Remove product error:', error);
        res.status(500).json({ error: 'Failed to remove product' });
    }
});

// Get ImageKit files (admin only)
app.get('/api/imagekit/files', async (req, res) => {
    try {
        const { password } = req.query;
        
        if (password !== '9890') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const fetch = (await import('node-fetch')).default;
        const authString = `${IMAGEKIT_CONFIG.privateKey}:`;
        const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
        
        const response = await fetch('https://api.imagekit.io/v1/files', {
            headers: {
                'Authorization': authHeader
            }
        });
        
        if (!response.ok) {
            return res.status(500).json({ error: 'Failed to fetch ImageKit files' });
        }
        
        const files = await response.json();
        res.json(files);
        
    } catch (error) {
        console.error('Error fetching ImageKit files:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

// Run all images - sync ImageKit files with products
app.post('/api/run-all-images', async (req, res) => {
    try {
        const { password } = req.body;
        
        if (password !== '9890') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const fetch = (await import('node-fetch')).default;
        const authString = `${IMAGEKIT_CONFIG.privateKey}:`;
        const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
        
        // Get all files from ImageKit
        const response = await fetch('https://api.imagekit.io/v1/files', {
            headers: {
                'Authorization': authHeader
            }
        });
        
        if (!response.ok) {
            return res.status(500).json({ error: 'Failed to fetch ImageKit files' });
        }
        
        const imageKitFiles = await response.json();
        
        // Read current products
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const products = JSON.parse(data);
        
        const results = [];
        let updatedCount = 0;
        
        // Check each ImageKit file and auto-create products
        for (const file of imageKitFiles) {
            const filename = file.name;
            let foundMatch = false;
            
            // Search through all categories for a product using this image
            Object.keys(products).forEach(category => {
                products[category].forEach(product => {
                    if (product.imageUrl && product.imageUrl.includes(filename)) {
                        foundMatch = true;
                        results.push({
                            type: 'success',
                            message: `${filename} is already assigned to "${product.name}" in ${category}`
                        });
                    }
                });
            });
            
            if (!foundMatch) {
                // Try to parse filename to extract product details
                const parts = filename.split('_');
                let detectedCategory = null;
                let productName = 'Unknown Product';
                let price = null;
                let description = 'Auto-generated from ImageKit';
                
                // Parse filename format: category_name_price_description_timestamp.ext
                if (parts.length >= 4) {
                    const categoryPrefix = parts[0].toLowerCase();
                    productName = (parts[1] || 'Unknown Product').replace(/-/g, ' ');
                    price = parts[2] && !isNaN(parts[2]) ? parseFloat(parts[2]) : null;
                    description = (parts[3] || 'Auto-generated from ImageKit').replace(/-/g, ' ');
                    
                    // Map category prefixes back to full category names
                    const categoryReverseMap = {
                        'fridge': 'fridges',
                        'clothwash': 'cloth-washers',
                        'ac': 'acs',
                        'fan': 'fans',
                        'dishwash': 'dish-washers',
                        'waterdispenser': 'water-dispensers',
                        'other': 'other'
                    };
                    
                    detectedCategory = categoryReverseMap[categoryPrefix];
                } else {
                    // Fallback to keyword detection for old files
                    const lowerFilename = filename.toLowerCase();
                    if (lowerFilename.includes('fridge') || lowerFilename.includes('refrigerator')) {
                        detectedCategory = 'fridges';
                    } else if (lowerFilename.includes('wash') || lowerFilename.includes('laundry') || lowerFilename.includes('cloth')) {
                        detectedCategory = 'cloth-washers';
                    } else if (lowerFilename.includes('ac') || lowerFilename.includes('air') || lowerFilename.includes('conditioner') || lowerFilename.includes('cooling')) {
                        detectedCategory = 'acs';
                    } else if (lowerFilename.includes('fan') || lowerFilename.includes('ventilat')) {
                        detectedCategory = 'fans';
                    } else if (lowerFilename.includes('dish') || lowerFilename.includes('dishwash')) {
                        detectedCategory = 'dish-washers';
                    } else if (lowerFilename.includes('water') || lowerFilename.includes('dispenser') || lowerFilename.includes('cooler')) {
                        detectedCategory = 'water-dispensers';
                    } else {
                        detectedCategory = 'other';
                    }
                    
                    // Extract name from filename if no structured format
                    productName = filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                }
                
                // Create the product automatically
                if (detectedCategory) {
                    const newId = Math.floor(Math.random() * 9000) + 1000;
                    const imageUrl = `/api/images/${filename}`;
                    
                    const newProduct = {
                        name: productName,
                        id: newId.toString(),
                        description: description,
                        imageUrl: imageUrl,
                        price: price,
                        selected: false // Add selection functionality
                    };
                    
                    // Ensure category exists
                    if (!products[detectedCategory]) {
                        products[detectedCategory] = [];
                    }
                    
                    // Add product to the category
                    products[detectedCategory].push(newProduct);
                    updatedCount++;
                    
                    results.push({
                        type: 'success',
                        message: `✓ Created product "${productName}" in ${detectedCategory} (ID: ${newId})`
                    });
                } else {
                    results.push({
                        type: 'warning',
                        message: `⚠ Could not determine category for ${filename}`
                    });
                }
            }
        }
        
        // Save updated products if any were created
        if (updatedCount > 0) {
            await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));
            console.log(`Successfully created ${updatedCount} new products`);
        }
        
        res.json({ 
            success: true,
            results: results,
            totalFiles: imageKitFiles.length,
            assignedFiles: results.filter(r => r.type === 'success').length,
            unassignedFiles: results.filter(r => r.type === 'warning').length
        });
        
    } catch (error) {
        console.error('Error running all images:', error);
        res.status(500).json({ error: 'Failed to run image sync' });
    }
});

// Scan for duplicate images
app.post('/api/scan-duplicates', async (req, res) => {
    try {
        const { password } = req.body;
        
        if (password !== '9890') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const fetch = (await import('node-fetch')).default;
        const authString = `${IMAGEKIT_CONFIG.privateKey}:`;
        const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
        
        // Get all files from ImageKit
        const response = await fetch('https://api.imagekit.io/v1/files', {
            headers: {
                'Authorization': authHeader
            }
        });
        
        if (!response.ok) {
            return res.status(500).json({ error: 'Failed to fetch ImageKit files' });
        }
        
        const files = await response.json();
        
        console.log(`Scanning ${files.length} files for duplicates...`);
        
        // Group files by size and name similarity to detect duplicates
        const duplicateGroups = [];
        const processedFiles = new Set();
        
        for (let i = 0; i < files.length; i++) {
            if (processedFiles.has(files[i].fileId)) continue;
            
            const currentFile = files[i];
            const similarFiles = [currentFile];
            processedFiles.add(currentFile.fileId);
            
            console.log(`\nChecking file ${i + 1}/${files.length}: ${currentFile.name}`);
            
            // Find files with same size and similar names
            for (let j = i + 1; j < files.length; j++) {
                if (processedFiles.has(files[j].fileId)) continue;
                
                const compareFile = files[j];
                
                // Check if files are potential duplicates
                if (isPotentialDuplicate(currentFile, compareFile)) {
                    console.log(`Found duplicate: ${compareFile.name}`);
                    similarFiles.push(compareFile);
                    processedFiles.add(compareFile.fileId);
                }
            }
            
            // If we found duplicates (more than one similar file)
            if (similarFiles.length > 1) {
                console.log(`Duplicate group found with ${similarFiles.length} files`);
                duplicateGroups.push({
                    size: currentFile.size,
                    files: similarFiles.map(file => ({
                        fileId: file.fileId,
                        name: file.name,
                        url: file.url,
                        uploadedAt: file.uploadedAt
                    }))
                });
            }
        }
        
        res.json({ 
            success: true,
            duplicates: duplicateGroups,
            totalFiles: files.length,
            duplicateGroups: duplicateGroups.length
        });
        
    } catch (error) {
        console.error('Error scanning for duplicates:', error);
        res.status(500).json({ error: 'Failed to scan for duplicates' });
    }
});

// Remove duplicate images
app.post('/api/remove-duplicates', async (req, res) => {
    try {
        const { duplicates, password } = req.body;
        
        if (password !== '9890') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const fetch = (await import('node-fetch')).default;
        const authString = `${IMAGEKIT_CONFIG.privateKey}:`;
        const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
        
        let removedCount = 0;
        let productsRemovedCount = 0;
        const errors = [];
        
        // Read current products data
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const products = JSON.parse(data);
        
        // For each duplicate group, keep the first file and remove the rest
        for (const group of duplicates) {
            const filesToKeep = group.files[0]; // Keep the first file
            const filesToRemove = group.files.slice(1); // Remove the rest
            
            console.log(`Processing duplicate group: keeping ${filesToKeep.name}, removing ${filesToRemove.length} duplicates`);
            
            for (const file of filesToRemove) {
                try {
                    // First, find and remove products that use this image
                    const filename = file.name;
                    const imageUrlToRemove = `/api/images/${filename}`;
                    
                    // Search through all categories for products using this image
                    Object.keys(products).forEach(category => {
                        if (products[category] && Array.isArray(products[category])) {
                            const originalLength = products[category].length;
                            products[category] = products[category].filter(product => {
                                if (product.imageUrl === imageUrlToRemove) {
                                    console.log(`Removing duplicate product: ${product.name} (ID: ${product.id}) from ${category}`);
                                    productsRemovedCount++;
                                    return false; // Remove this product
                                }
                                return true; // Keep this product
                            });
                        }
                    });
                    
                    // Then delete the image from ImageKit
                    const deleteResponse = await fetch(`https://api.imagekit.io/v1/files/${file.fileId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': authHeader
                        }
                    });
                    
                    if (deleteResponse.ok) {
                        removedCount++;
                        console.log(`Deleted duplicate image: ${file.name}`);
                    } else {
                        const errorData = await deleteResponse.json();
                        errors.push(`Failed to delete image ${file.name}: ${errorData.message || 'Unknown error'}`);
                    }
                } catch (error) {
                    errors.push(`Failed to delete ${file.name}: ${error.message}`);
                }
            }
        }
        
        // Save updated products data
        await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));
        console.log(`Removed ${productsRemovedCount} duplicate products from database`);
        
        res.json({ 
            success: true,
            removedImagesCount: removedCount,
            removedProductsCount: productsRemovedCount,
            errors: errors,
            message: `Successfully removed ${removedCount} duplicate images and ${productsRemovedCount} duplicate products`
        });
        
    } catch (error) {
        console.error('Error removing duplicates:', error);
        res.status(500).json({ error: 'Failed to remove duplicates' });
    }
});

// Helper function to determine if two files are potential duplicates
function isPotentialDuplicate(file1, file2) {
    // Debug logging to understand file structure
    console.log('Comparing files:', {
        file1: { name: file1.name, size: file1.size },
        file2: { name: file2.name, size: file2.size }
    });
    
    // Same size is a strong indicator
    if (file1.size === file2.size) {
        // Extract base names by removing various timestamp patterns and category prefixes
        const cleanName1 = cleanFileName(file1.name);
        const cleanName2 = cleanFileName(file2.name);
        
        console.log('Cleaned names:', { cleanName1, cleanName2 });
        
        // If cleaned names are identical, it's a duplicate
        if (cleanName1 === cleanName2) {
            console.log('Exact match found!');
            return true;
        }
        
        // Check for very similar names (Levenshtein distance)
        const similarity = calculateStringSimilarity(cleanName1, cleanName2);
        console.log('Name similarity:', similarity);
        
        if (similarity > 0.85) { // 85% similarity threshold
            console.log('High similarity match found!');
            return true;
        }
    }
    
    return false;
}

// Helper function to clean file names for comparison
function cleanFileName(fileName) {
    console.log('Original filename:', fileName);
    
    // Remove extension first
    let cleaned = fileName.replace(/\.[^.]+$/, '');
    console.log('After removing extension:', cleaned);
    
    // Remove ALL numeric patterns that could be unique identifiers:
    // - Any sequence of 6+ digits (timestamps, unique IDs, etc.)
    cleaned = cleaned.replace(/\d{6,}/g, '');
    console.log('After removing long numbers:', cleaned);
    
    // Remove common separators followed by numbers (any length)
    cleaned = cleaned.replace(/[-_]+\d+/g, '');
    console.log('After removing separator+numbers:', cleaned);
    
    // Remove numbers followed by separators
    cleaned = cleaned.replace(/\d+[-_]+/g, '');
    console.log('After removing numbers+separators:', cleaned);
    
    // Remove category prefixes that might differ
    cleaned = cleaned.replace(/^(fridges?|clothwashers?|acs?|fans?|dishwashers?|waterdispensers?|other)[-_]*/i, '');
    console.log('After removing category prefixes:', cleaned);
    
    // Remove common suffixes like (1), (2), _copy, etc.
    cleaned = cleaned.replace(/[-_]?(copy|duplicate|\(\d+\))[-_]?/gi, '');
    console.log('After removing copy suffixes:', cleaned);
    
    // Remove any remaining standalone numbers
    cleaned = cleaned.replace(/\b\d+\b/g, '');
    console.log('After removing standalone numbers:', cleaned);
    
    // Remove random alphanumeric codes (like EhpCr8Lm1, wNsgNYT2r)
    // These are typically 6+ characters mixing letters and numbers
    cleaned = cleaned.replace(/[-_][a-zA-Z0-9]{6,}/g, '');
    console.log('After removing random codes:', cleaned);
    
    // Remove any remaining short alphanumeric sequences at word boundaries
    cleaned = cleaned.replace(/\b[a-zA-Z0-9]{3,8}\b/g, '');
    console.log('After removing short codes:', cleaned);
    
    // Clean up any remaining multiple separators
    cleaned = cleaned.replace(/[-_]{2,}/g, '-');
    cleaned = cleaned.replace(/^[-_]+|[-_]+$/g, ''); // Remove leading/trailing separators
    
    const final = cleaned.toLowerCase().trim();
    console.log('Final cleaned name:', final);
    
    return final;
}

// Helper function to calculate string similarity
function calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

// Helper function for Levenshtein distance
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

// Automatic sync state
let autoSyncInterval = null;
let isAutoSyncRunning = false;
let nextSyncTime = null;

// Auto-sync status endpoint (permanent mode)
app.post('/api/auto-sync', async (req, res) => {
    try {
        const { action, password } = req.body;
        
        if (password !== '9890') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        if (action === 'start') {
            res.json({ 
                success: true, 
                message: 'Auto-sync is running permanently (cannot be stopped)',
                isPermanent: true
            });
            
        } else if (action === 'stop') {
            res.json({ 
                success: false, 
                message: 'Auto-sync is running permanently and cannot be stopped',
                isPermanent: true
            });
            
        } else if (action === 'status') {
            const timeLeft = nextSyncTime ? Math.max(0, Math.ceil((nextSyncTime - Date.now()) / 1000)) : 0;
            res.json({ 
                success: true, 
                isRunning: isAutoSyncRunning,
                message: 'Auto-sync is running permanently in the background',
                isPermanent: true,
                nextSyncIn: timeLeft
            });
        } else {
            res.status(400).json({ error: 'Invalid action. Use start, stop, or status' });
        }
        
    } catch (error) {
        console.error('Auto-sync error:', error);
        res.status(500).json({ error: 'Failed to manage auto-sync' });
    }
});

// Extract the run all images logic into a reusable function
async function runAllImagesSync() {
    try {
        const fetch = (await import('node-fetch')).default;
        const authString = `${IMAGEKIT_CONFIG.privateKey}:`;
        const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
        
        // Get all files from ImageKit
        const response = await fetch('https://api.imagekit.io/v1/files', {
            headers: {
                'Authorization': authHeader
            }
        });
        
        if (!response.ok) {
            console.warn('Auto-sync: Failed to fetch ImageKit files');
            return { success: false, error: 'Failed to fetch ImageKit files' };
        }
        
        const imageKitFiles = await response.json();
        
        // Read current products
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const products = JSON.parse(data);
        
        let updatedCount = 0;
        
        // Check each ImageKit file and auto-create products
        for (const file of imageKitFiles) {
            const filename = file.name;
            let foundMatch = false;
            
            // Search through all categories for a product using this image
            Object.keys(products).forEach(category => {
                products[category].forEach(product => {
                    if (product.imageUrl && product.imageUrl.includes(filename)) {
                        foundMatch = true;
                    }
                });
            });
            
            if (!foundMatch) {
                // Try to parse filename to extract product details
                const parts = filename.split('_');
                let detectedCategory = null;
                let productName = 'Unknown Product';
                let price = null;
                let description = 'Auto-generated from ImageKit';
                
                // Parse filename format: category_name_price_description_timestamp.ext
                if (parts.length >= 4) {
                    const categoryPrefix = parts[0].toLowerCase();
                    productName = (parts[1] || 'Unknown Product').replace(/-/g, ' ');
                    price = parts[2] && !isNaN(parts[2]) ? parseFloat(parts[2]) : null;
                    description = (parts[3] || 'Auto-generated from ImageKit').replace(/-/g, ' ');
                    
                    // Map category prefixes back to full category names
                    const categoryReverseMap = {
                        'fridge': 'fridges',
                        'clothwash': 'cloth-washers',
                        'ac': 'acs',
                        'fan': 'fans',
                        'dishwash': 'dish-washers',
                        'waterdispenser': 'water-dispensers',
                        'other': 'other'
                    };
                    
                    detectedCategory = categoryReverseMap[categoryPrefix];
                } else {
                    // Fallback to keyword detection for old files
                    const lowerFilename = filename.toLowerCase();
                    if (lowerFilename.includes('fridge') || lowerFilename.includes('refrigerator')) {
                        detectedCategory = 'fridges';
                    } else if (lowerFilename.includes('wash') || lowerFilename.includes('laundry') || lowerFilename.includes('cloth')) {
                        detectedCategory = 'cloth-washers';
                    } else if (lowerFilename.includes('ac') || lowerFilename.includes('air') || lowerFilename.includes('conditioner') || lowerFilename.includes('cooling')) {
                        detectedCategory = 'acs';
                    } else if (lowerFilename.includes('fan') || lowerFilename.includes('ventilat')) {
                        detectedCategory = 'fans';
                    } else if (lowerFilename.includes('dish') || lowerFilename.includes('dishwash')) {
                        detectedCategory = 'dish-washers';
                    } else if (lowerFilename.includes('water') || lowerFilename.includes('dispenser') || lowerFilename.includes('cooler')) {
                        detectedCategory = 'water-dispensers';
                    } else {
                        detectedCategory = 'other';
                    }
                    
                    // Extract name from filename if no structured format
                    productName = filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                }
                
                // Create the product automatically
                if (detectedCategory) {
                    const newId = Math.floor(Math.random() * 9000) + 1000;
                    const imageUrl = `/api/images/${filename}`;
                    
                    const newProduct = {
                        name: productName,
                        id: newId.toString(),
                        description: description,
                        imageUrl: imageUrl,
                        price: price
                    };
                    
                    // Ensure category exists
                    if (!products[detectedCategory]) {
                        products[detectedCategory] = [];
                    }
                    
                    // Add product to the category
                    products[detectedCategory].push(newProduct);
                    updatedCount++;
                    
                    console.log(`Auto-sync: Created product "${productName}" in ${detectedCategory} (ID: ${newId})`);
                }
            }
        }
        
        // Save updated products if any were created
        if (updatedCount > 0) {
            await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));
            console.log(`Auto-sync: Successfully created ${updatedCount} new products`);
        } else {
            console.log('Auto-sync: No new products to create');
        }
        
        return { 
            success: true,
            updatedCount: updatedCount,
            totalFiles: imageKitFiles.length
        };
        
    } catch (error) {
        console.error('Auto-sync error:', error);
        return { success: false, error: error.message };
    }
}

// Start server
async function startServer() {
    await initializeData();
    
    // Start auto-sync immediately and permanently
    if (!isAutoSyncRunning) {
        isAutoSyncRunning = true;
        console.log('Starting permanent auto-sync...');
        
        // Run immediately first
        await runAllImagesSync();
        
        // Then set up permanent interval
        const runAutoSync = async () => {
            if (!isAutoSyncRunning) return;
            
            console.log('Auto-sync: Running scheduled sync...');
            await runAllImagesSync();
            
            // Schedule next run (random 1-5 minutes)
            const nextRunDelay = Math.floor(Math.random() * 4 * 60 * 1000) + 60 * 1000; // 1-5 minutes
            nextSyncTime = Date.now() + nextRunDelay;
            console.log(`Auto-sync: Next run in ${Math.round(nextRunDelay / 1000 / 60)} minutes`);
            
            autoSyncInterval = setTimeout(runAutoSync, nextRunDelay);
        };
        
        // Start the permanent cycle
        const firstDelay = Math.floor(Math.random() * 4 * 60 * 1000) + 60 * 1000; // 1-5 minutes
        nextSyncTime = Date.now() + firstDelay;
        console.log(`Auto-sync: First scheduled run in ${Math.round(firstDelay / 1000 / 60)} minutes`);
        autoSyncInterval = setTimeout(runAutoSync, firstDelay);
        
        console.log('✅ Permanent auto-sync started successfully');
    }
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
        console.log('ImageKit endpoint:', IMAGEKIT_CONFIG.urlEndpoint);
        console.log('🔄 Auto-sync is running permanently in the background');
    });
}

startServer();