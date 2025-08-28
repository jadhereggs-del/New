
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const app = express();
const PORT = 5000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!require('fs').existsSync(uploadsDir)) {
    require('fs').mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for local file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
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

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Upload image endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded' });
        }

        // File is already saved to uploads directory by multer
        const imageUrl = `/uploads/${req.file.filename}`;
        
        res.json({ 
            success: true, 
            imageUrl: imageUrl,
            filename: req.file.filename
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
