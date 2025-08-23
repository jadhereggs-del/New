
// Global variables
let selectedProduct = null;
let allProducts = [];
let productsData = {};

// Initialize the website
document.addEventListener('DOMContentLoaded', function() {
    // Show loading screen for 2 seconds
    setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
    }, 2000);

    loadProducts();
    initializeEventListeners();
    setupSearch();
    setupAdminPanel();
});

// Load products from backend
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        productsData = await response.json();
        
        // Update search products for "other" category
        allProducts = productsData.other.map(product => ({
            name: product.name,
            id: product.id,
            keywords: generateSearchKeywords(product.name)
        }));
        
        // Update HTML with loaded products
        updateProductsDisplay();
    } catch (error) {
        console.error('Failed to load products:', error);
    }
}

// Update products display in HTML
function updateProductsDisplay() {
    const categories = ['fridges', 'cloth-washers', 'acs', 'fans', 'dish-washers', 'other'];
    
    categories.forEach(category => {
        const section = document.getElementById(category);
        const productsGrid = section.querySelector('.products-grid');
        
        // Clear existing products except the first one (template)
        const existingProducts = productsGrid.querySelectorAll('.product-card');
        existingProducts.forEach((product, index) => {
            if (index > 0) product.remove();
        });
        
        // Add products from backend
        if (productsData[category] && productsData[category].length > 1) {
            productsData[category].slice(1).forEach(product => {
                addProductToGrid(product, category);
            });
        }
    });
    
    // Update event listeners after displaying products
    updateProductEventListeners();
    
    // Update search products for "other" category
    allProducts = productsData.other ? productsData.other.map(product => ({
        name: product.name,
        id: product.id,
        keywords: generateSearchKeywords(product.name)
    })) : [];
}

// Initialize all event listeners
function initializeEventListeners() {
    // Category buttons navigation
    const categoryButtons = document.querySelectorAll('.category-btn');
    categoryButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetSection = this.getAttribute('data-section');
            navigateToSection(targetSection);
        });
    });

    // Back buttons
    const backButtons = document.querySelectorAll('.back-btn');
    backButtons.forEach(button => {
        button.addEventListener('click', function() {
            navigateToSection('homepage');
        });
    });

    // Product selection in all sections (will be updated dynamically)
    updateProductEventListeners();

    // Finish buttons for all categories
    const finishButtons = document.querySelectorAll('.finish-btn');
    finishButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (selectedProduct) {
                redirectToWhatsApp();
            }
        });
    });

    // Admin button
    const adminBtn = document.getElementById('admin-btn');
    adminBtn.addEventListener('click', function() {
        promptAdminCode();
    });
}

// Navigation function with smooth transitions
function navigateToSection(sectionId) {
    const currentSection = document.querySelector('.section.active');
    const targetSection = document.getElementById(sectionId);

    if (currentSection === targetSection) return;

    // Add fade out animation
    currentSection.style.animation = 'fadeOut 0.3s ease';
    
    setTimeout(() => {
        currentSection.classList.remove('active');
        currentSection.style.animation = '';
        
        targetSection.classList.add('active');
        targetSection.style.animation = 'fadeIn 0.6s ease';
        
        // Reset selected product when leaving "other" section
        if (currentSection.id === 'other') {
            resetProductSelection();
        }
    }, 300);
}

// Add fade out animation to CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
    }
`;
document.head.appendChild(style);

// Search functionality with fuzzy matching
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');

    searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase().trim();
        
        if (query.length < 2) {
            searchResults.style.display = 'none';
            return;
        }

        const matches = findMatches(query);
        displaySearchResults(matches, searchResults);
    });

    searchInput.addEventListener('focus', function() {
        if (this.value.length >= 2) {
            searchResults.style.display = 'block';
        }
    });

    // Hide search results when clicking outside
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });
}

// Fuzzy search algorithm
function findMatches(query) {
    const matches = [];
    
    allProducts.forEach(product => {
        product.keywords.forEach(keyword => {
            const similarity = calculateSimilarity(query, keyword);
            if (similarity > 0.6) { // 60% similarity threshold
                matches.push({
                    product: product,
                    similarity: similarity,
                    matchedKeyword: keyword
                });
            }
        });
    });

    // Sort by similarity (highest first) and remove duplicates
    const uniqueMatches = [];
    const seenProducts = new Set();
    
    matches
        .sort((a, b) => b.similarity - a.similarity)
        .forEach(match => {
            if (!seenProducts.has(match.product.name)) {
                uniqueMatches.push(match);
                seenProducts.add(match.product.name);
            }
        });

    return uniqueMatches;
}

// Calculate string similarity using Levenshtein distance
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

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

// Display search results
function displaySearchResults(matches, resultsContainer) {
    resultsContainer.innerHTML = '';
    
    if (matches.length === 0) {
        resultsContainer.innerHTML = '<div class="search-result-item">No products found</div>';
    } else {
        matches.slice(0, 5).forEach(match => { // Show top 5 matches
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';
            resultItem.textContent = match.product.name;
            resultItem.addEventListener('click', function() {
                selectProductByName(match.product.name);
                resultsContainer.style.display = 'none';
                document.getElementById('search-input').value = match.product.name;
            });
            resultsContainer.appendChild(resultItem);
        });
    }
    
    resultsContainer.style.display = 'block';
}

// Select product by name
function selectProductByName(productName) {
    const productCard = document.querySelector(`[data-product="${productName}"]`);
    if (productCard) {
        selectProduct(productCard);
        productCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Product selection
function selectProduct(productElement) {
    // Remove previous selection
    document.querySelectorAll('.product-card.selected').forEach(card => {
        card.classList.remove('selected');
    });

    // Select new product
    productElement.classList.add('selected');
    selectedProduct = {
        name: productElement.getAttribute('data-product'),
        id: productElement.getAttribute('data-id')
    };

    // Find current section and show selection
    const currentSection = document.querySelector('.section.active');
    const sectionId = currentSection.id;
    const selectionDisplay = document.getElementById(sectionId + '-selection');
    const finishBtn = currentSection.querySelector('.finish-btn');

    // Show selection
    if (selectionDisplay) {
        selectionDisplay.textContent = `Selected: ${selectedProduct.name}`;
        selectionDisplay.classList.add('show');
    }

    // Show finish button with animation
    if (finishBtn) {
        finishBtn.style.display = 'block';
        finishBtn.style.animation = 'fadeIn 0.5s ease';
    }
}

// Reset product selection
function resetProductSelection() {
    document.querySelectorAll('.product-card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    selectedProduct = null;
    
    // Hide all finish buttons and selection displays
    document.querySelectorAll('.finish-btn').forEach(btn => {
        btn.style.display = 'none';
    });
    document.querySelectorAll('.selection-display').forEach(display => {
        display.classList.remove('show');
    });
}

// Redirect to WhatsApp
function redirectToWhatsApp() {
    const message = `I want the ${selectedProduct.name} ${selectedProduct.id}.`;
    const phoneNumber = '+96171294697';
    const whatsappUrl = `https://wa.me/${phoneNumber.replace(/\+/g, '')}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
}

// Admin panel functionality
function setupAdminPanel() {
    const productForm = document.getElementById('product-form');
    const productImage = document.getElementById('product-image');
    const imagePreview = document.getElementById('image-preview');
    const removeBtn = document.getElementById('remove-btn');
    const removeCategorySelect = document.getElementById('remove-category');
    
    productForm.addEventListener('submit', function(e) {
        e.preventDefault();
        addNewProduct();
    });
    
    productImage.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
    
    removeBtn.addEventListener('click', function() {
        removeProduct();
    });
    
    removeCategorySelect.addEventListener('change', function() {
        populateRemoveProductSelect(this.value);
    });
}

// Admin code prompt
function promptAdminCode() {
    const code = prompt('Enter admin code:');
    if (code === '1234') {
        navigateToSection('admin-panel');
    } else if (code !== null) {
        alert('Incorrect code!');
    }
}

// Add new product (admin functionality)
async function addNewProduct() {
    const name = document.getElementById('product-name').value.trim();
    const description = document.getElementById('product-description').value.trim();
    const category = document.getElementById('product-category').value;
    const imageFile = document.getElementById('product-image').files[0];
    
    if (!name || !category || !imageFile) {
        alert('Please fill in all required fields and select an image.');
        return;
    }
    
    try {
        // First upload the image
        const formData = new FormData();
        formData.append('image', imageFile);
        
        const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();
        
        if (!uploadResponse.ok) {
            alert(uploadResult.error || 'Failed to upload image');
            return;
        }
        
        // Then add the product with the image URL
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name,
                description,
                category,
                imageUrl: uploadResult.imageUrl,
                password: '1234'
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Add to local data
            if (!productsData[category]) {
                productsData[category] = [];
            }
            productsData[category].push(result.product);
            
            // Add to display
            addProductToGrid(result.product, category);
            
            // Update search database if it's "other" category
            if (category === 'other') {
                allProducts.push({
                    name: result.product.name,
                    id: result.product.id,
                    keywords: generateSearchKeywords(result.product.name)
                });
            }
            
            // Clear form
            document.getElementById('product-form').reset();
            document.getElementById('image-preview').style.display = 'none';
            document.getElementById('image-preview').innerHTML = '';
            
            // Show success message
            alert(`Product "${name}" added successfully to ${category} category! This change is permanent and will be visible to all users.`);
            
            // Go back to homepage
            navigateToSection('homepage');
        } else {
            alert(result.error || 'Failed to add product');
        }
    } catch (error) {
        alert('Failed to add product. Please check your connection and try again.');
        console.error('Error:', error);
    }
}

// Add product card to grid
function addProductToGrid(product, category) {
    const section = document.getElementById(category);
    const productsGrid = section.querySelector('.products-grid');
    
    const productCard = document.createElement('div');
    productCard.className = 'product-card selectable';
    productCard.setAttribute('data-product', product.name);
    productCard.setAttribute('data-id', product.id);
    
    productCard.addEventListener('click', function() {
        selectProduct(this);
    });
    
    const imageHtml = product.imageUrl 
        ? `<img src="${product.imageUrl}" alt="${product.name}" class="product-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
           <div class="product-image-placeholder" style="display: none;">${product.name} Image</div>`
        : `<div class="product-image-placeholder">${product.name} Image</div>`;
    
    productCard.innerHTML = `
        ${imageHtml}
        <h3>${product.name}</h3>
        ${product.description ? `<p>${product.description}</p>` : ''}
    `;
    
    productsGrid.appendChild(productCard);
}

// Update product event listeners for all categories
function updateProductEventListeners() {
    const selectableProducts = document.querySelectorAll('.selectable');
    selectableProducts.forEach(product => {
        product.addEventListener('click', function() {
            selectProduct(this);
        });
    });
}

// Generate keywords for search
function generateSearchKeywords(name) {
    const words = name.toLowerCase().split(' ');
    const keywords = [];
    
    words.forEach(word => {
        keywords.push(word);
        // Add common misspellings
        if (word.length > 3) {
            keywords.push(word.slice(0, -1)); // Remove last character
            keywords.push(word + 'r'); // Add extra 'r'
        }
    });
    
    return [name.toLowerCase(), ...keywords];
}



// Populate remove product select dropdown
function populateRemoveProductSelect(category) {
    const removeProductSelect = document.getElementById('remove-product');
    removeProductSelect.innerHTML = '<option value="">Select Product</option>';
    
    if (!category || !productsData[category]) {
        return;
    }
    
    productsData[category].forEach(product => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = product.name;
        removeProductSelect.appendChild(option);
    });
}

// Remove product functionality
async function removeProduct() {
    const category = document.getElementById('remove-category').value;
    const productId = document.getElementById('remove-product').value;
    
    if (!category || !productId) {
        alert('Please select both category and product to remove.');
        return;
    }
    
    // Find product name for confirmation
    const product = productsData[category].find(p => p.id === productId);
    if (!product) {
        alert('Product not found.');
        return;
    }
    
    // Confirm removal
    if (!confirm(`Are you sure you want to remove "${product.name}"? This action cannot be undone and will affect all visitors.`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/products', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                category,
                productId,
                password: '1234'
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Remove from local data
            const productIndex = productsData[category].findIndex(p => p.id === productId);
            if (productIndex !== -1) {
                productsData[category].splice(productIndex, 1);
            }
            
            // Remove from display
            removeProductFromGrid(productId, category);
            
            // Update search database if it's "other" category
            if (category === 'other') {
                const searchIndex = allProducts.findIndex(p => p.id === productId);
                if (searchIndex !== -1) {
                    allProducts.splice(searchIndex, 1);
                }
            }
            
            // Reset form
            document.getElementById('remove-category').value = '';
            document.getElementById('remove-product').innerHTML = '<option value="">Select Product</option>';
            
            // Show success message
            alert(`Product "${result.removedProduct.name}" has been removed successfully! This change is permanent and affects all visitors.`);
            
        } else {
            alert(result.error || 'Failed to remove product');
        }
    } catch (error) {
        alert('Failed to remove product. Please check your connection and try again.');
        console.error('Error:', error);
    }
}

// Remove product card from grid
function removeProductFromGrid(productId, category) {
    const section = document.getElementById(category);
    const productCard = section.querySelector(`[data-id="${productId}"]`);
    
    if (productCard) {
        // Add fade out animation
        productCard.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            productCard.remove();
        }, 300);
        
        // If this was the selected product, reset selection
        if (selectedProduct && selectedProduct.id === productId) {
            resetProductSelection();
        }
    }
}

// Add smooth scrolling for better UX
document.documentElement.style.scrollBehavior = 'smooth';

// Add loading states for better feedback
function addLoadingState(element, duration = 1000) {
    const originalText = element.textContent;
    element.textContent = 'Loading...';
    element.disabled = true;
    
    setTimeout(() => {
        element.textContent = originalText;
        element.disabled = false;
    }, duration);
}
