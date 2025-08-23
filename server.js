
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const app = express();
const PORT = 5000;

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = './uploads';
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
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

// Initialize products data file if it doesn't exist
async function initializeData() {
    try {
        await fs.access(DATA_FILE);
    } catch (error) {
        // File doesn't exist, create it with default data
        const defaultData = {
            fridges: [
                { name: 'Premium Refrigerator', id: '1001' }
            ],
            'cloth-washers': [
                { name: 'Front Load Washer', id: '2001' }
            ],
            acs: [
                { name: 'Split AC Unit', id: '3001' }
            ],
            fans: [
                { name: 'Ceiling Fan', id: '4001' }
            ],
            'dish-washers': [
                { name: 'Built-in Dishwasher', id: '5001' }
            ],
            other: [
                { name: 'High-Speed Blender', id: '4152' }
            ]
        };
        await fs.writeFile(DATA_FILE, JSON.stringify(defaultData, null, 2));
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

// Upload image endpoint
app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded' });
        }

        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ 
            success: true, 
            imageUrl: imageUrl,
            filename: req.file.filename
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// Serve uploaded images
app.use('/uploads', express.static(UPLOADS_DIR));

// Add new product
app.post('/api/products', async (req, res) => {
    try {
        const { name, description, category, password, imageUrl } = req.body;
        
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

        products[category].push({
            name: name,
            id: newId.toString(),
            description: description || '',
            imageUrl: imageUrl || null
        });

        // Save updated data
        await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));

        res.json({ 
            success: true, 
            product: { name, id: newId.toString(), description, category, imageUrl } 
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add product' });
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
        products[category].splice(productIndex, 1);

        // Save updated data
        await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));

        res.json({ 
            success: true, 
            removedProduct: removedProduct,
            category: category
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove product' });
    }
});

// Start server
async function startServer() {
    await initializeData();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
}

startServer();
