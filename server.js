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
        if (password !== '1234') {
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
        if (password !== '1234') {
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
        if (password !== '1234') {
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
        
        if (password !== '1234') {
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
        
        if (password !== '1234') {
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

// Start server
async function startServer() {
    await initializeData();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
        console.log('ImageKit endpoint:', IMAGEKIT_CONFIG.urlEndpoint);
    });
}

startServer();
