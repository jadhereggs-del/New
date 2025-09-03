
// Global variables
let selectedProducts = {}; // Changed to object to store multiple products per category
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
    setupIdSearch();
    setupHomepageIdSearch();
    setupRunAllImages();
    setupCartFunctionality();
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
        
        // Clear all existing products
        const existingProducts = productsGrid.querySelectorAll('.product-card');
        existingProducts.forEach(product => product.remove());
        
        // Add all products from backend
        if (productsData[category] && productsData[category].length > 0) {
            productsData[category].forEach(product => {
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
            const currentSection = document.querySelector('.section.active');
            const sectionId = currentSection.id;
            if (selectedProducts[sectionId] && selectedProducts[sectionId].length > 0) {
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

// Search functionality with fuzzy matching and ID search - now works for all categories
function setupSearch() {
    // Setup search for all categories
    const categories = ['other', 'fridges', 'cloth-washers', 'acs', 'fans', 'dish-washers', 'homepage'];
    
    categories.forEach(category => {
        const searchInputId = category === 'homepage' ? 'homepage-search-input' : `${category}-search-input`;
        const searchResultsId = category === 'homepage' ? 'homepage-search-results' : `${category}-search-results`;
        
        const searchInput = document.getElementById(searchInputId);
        const searchResults = document.getElementById(searchResultsId);
        
        if (!searchInput || !searchResults) return;
        
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();
            
            if (query.length < 2) {
                searchResults.style.display = 'none';
                return;
            }

            // For homepage, search all products. For others, filter by category
            const categoryFilter = category === 'homepage' || category === 'other' ? null : category;
            const matches = findMatches(query, categoryFilter);
            displaySearchResults(matches, searchResults, searchInputId);
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
    });
}

// Enhanced search algorithm with ID support - now works for specific categories
function findMatches(query, categoryFilter = null) {
    const matches = [];
    
    let searchProducts = allProducts;
    // Filter by category if specified
    if (categoryFilter) {
        searchProducts = allProducts.filter(product => product.category === categoryFilter);
    }
    
    // Check for exact ID match first
    searchProducts.forEach(product => {
        if (product.id.toLowerCase().includes(query)) {
            matches.push({
                product: product,
                similarity: 1.0,
                matchedKeyword: 'ID: ' + product.id
            });
        }
    });
    
    // Then check name matches
    searchProducts.forEach(product => {
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
            if (!seenProducts.has(match.product.id)) {
                uniqueMatches.push(match);
                seenProducts.add(match.product.id);
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

// Display search results - now works for any search input and results container
function displaySearchResults(matches, resultsContainer, searchInputId = 'search-input') {
    resultsContainer.innerHTML = '';
    
    if (matches.length === 0) {
        resultsContainer.innerHTML = '<div class="search-result-item">No products found</div>';
    } else {
        matches.slice(0, 5).forEach(match => { // Show top 5 matches
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';
            resultItem.innerHTML = `
                <strong>${match.product.name}</strong><br>
                <small>ID: ${match.product.id} | Match: ${match.matchedKeyword}</small>
            `;
            resultItem.addEventListener('click', function() {
                selectProductByName(match.product.name);
                resultsContainer.style.display = 'none';
                const searchInput = document.getElementById(searchInputId);
                if (searchInput) {
                    searchInput.value = match.product.name;
                }
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

// Product selection (now supports multiple items)
function selectProduct(productElement) {
    const currentSection = document.querySelector('.section.active');
    const sectionId = currentSection.id;
    
    const product = {
        name: productElement.getAttribute('data-product'),
        id: productElement.getAttribute('data-id')
    };

    // Initialize cart for this section if not exists
    if (!selectedProducts[sectionId]) {
        selectedProducts[sectionId] = [];
    }

    // Check if product is already selected
    const existingIndex = selectedProducts[sectionId].findIndex(p => p.id === product.id);
    
    if (existingIndex !== -1) {
        // Remove from cart if already selected
        selectedProducts[sectionId].splice(existingIndex, 1);
        productElement.classList.remove('selected');
    } else {
        // Add to cart
        selectedProducts[sectionId].push(product);
        productElement.classList.add('selected');
    }

    updateCartDisplay(sectionId);
}

// Reset product selection
function resetProductSelection() {
    document.querySelectorAll('.product-card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    selectedProducts = {};
    
    // Hide all finish buttons and clear carts
    document.querySelectorAll('.finish-btn').forEach(btn => {
        btn.style.display = 'none';
    });
    document.querySelectorAll('.cart-items').forEach(cart => {
        cart.innerHTML = '';
    });
    document.querySelectorAll('[id$="-cart-count"]').forEach(counter => {
        counter.textContent = '0';
    });
    document.querySelectorAll('.clear-btn').forEach(btn => {
        btn.style.display = 'none';
    });
}

// Redirect to WhatsApp
function redirectToWhatsApp() {
    // Collect products from ALL tabs, not just current one
    let allSelectedProducts = [];
    
    // Go through all categories and collect selected products
    Object.keys(selectedProducts).forEach(categoryId => {
        if (selectedProducts[categoryId] && selectedProducts[categoryId].length > 0) {
            allSelectedProducts = allSelectedProducts.concat(selectedProducts[categoryId]);
        }
    });
    
    if (allSelectedProducts.length === 0) return;
    
    let message = `Hello! I'm interested in purchasing the following items from your electronics store:\n\n`;
    
    allSelectedProducts.forEach((product, index) => {
        message += `${index + 1}. ${product.name} (Product ID: ${product.id})\n`;
    });
    
    message += `\nPlease let me know about availability and pricing. Thank you!`;
    
    const phoneNumber = '+9613095233';
    const whatsappUrl = `https://wa.me/${phoneNumber.replace(/\+/g, '')}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
}

// Admin panel functionality
function setupAdminPanel() {
    const productForm = document.getElementById('product-form');
    const editForm = document.getElementById('edit-form');
    const productImage = document.getElementById('product-image');
    const editImage = document.getElementById('edit-image');
    const imagePreview = document.getElementById('image-preview');
    const editImagePreview = document.getElementById('edit-image-preview');
    const removeBtn = document.getElementById('remove-btn');
    const removeCategorySelect = document.getElementById('remove-category');
    const editCategorySelect = document.getElementById('edit-category');
    const editProductSelect = document.getElementById('edit-product');
    const cancelEditBtn = document.getElementById('cancel-edit');
    
    productForm.addEventListener('submit', function(e) {
        e.preventDefault();
        addNewProduct();
    });
    
    editForm.addEventListener('submit', function(e) {
        e.preventDefault();
        updateProduct();
    });
    
    productImage.addEventListener('change', function(e) {
        previewImage(e, imagePreview);
    });
    
    editImage.addEventListener('change', function(e) {
        previewImage(e, editImagePreview);
    });
    
    removeBtn.addEventListener('click', function() {
        removeProduct();
    });
    
    removeCategorySelect.addEventListener('change', function() {
        populateRemoveProductSelect(this.value);
    });
    
    editCategorySelect.addEventListener('change', function() {
        populateEditProductSelect(this.value);
    });
    
    editProductSelect.addEventListener('change', function() {
        if (this.value) {
            loadProductForEdit(editCategorySelect.value, this.value);
        } else {
            editForm.style.display = 'none';
        }
    });
    
    cancelEditBtn.addEventListener('click', function() {
        cancelEdit();
    });
}

function previewImage(event, previewContainer) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function populateEditProductSelect(category) {
    const editProductSelect = document.getElementById('edit-product');
    editProductSelect.innerHTML = '<option value="">Select Product</option>';
    document.getElementById('edit-form').style.display = 'none';
    
    if (!category || !productsData[category]) {
        return;
    }
    
    productsData[category].forEach(product => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = product.name;
        editProductSelect.appendChild(option);
    });
}

function loadProductForEdit(category, productId) {
    const product = productsData[category].find(p => p.id === productId);
    if (!product) return;
    
    document.getElementById('edit-name').value = product.name;
    document.getElementById('edit-description').value = product.description || '';
    document.getElementById('edit-price').value = product.price || '';
    
    const editImagePreview = document.getElementById('edit-image-preview');
    if (product.imageUrl) {
        editImagePreview.innerHTML = `<img src="${product.imageUrl}" alt="Current">`;
        editImagePreview.style.display = 'block';
    } else {
        editImagePreview.style.display = 'none';
    }
    
    document.getElementById('edit-form').style.display = 'block';
}

function cancelEdit() {
    document.getElementById('edit-category').value = '';
    document.getElementById('edit-product').innerHTML = '<option value="">Select Product</option>';
    document.getElementById('edit-form').style.display = 'none';
    document.getElementById('edit-form').reset();
    document.getElementById('edit-image-preview').style.display = 'none';
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
    const price = document.getElementById('product-price').value.trim();
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
        formData.append('category', category); // Include category in upload
        
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
                price: price || null,
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

// Update product (admin functionality)
async function updateProduct() {
    const category = document.getElementById('edit-category').value;
    const productId = document.getElementById('edit-product').value;
    const name = document.getElementById('edit-name').value.trim();
    const description = document.getElementById('edit-description').value.trim();
    const price = document.getElementById('edit-price').value.trim();
    const imageFile = document.getElementById('edit-image').files[0];
    
    if (!name || !category || !productId) {
        alert('Please fill in all required fields.');
        return;
    }
    
    try {
        let imageUrl = null;
        
        // Upload new image if provided
        if (imageFile) {
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
            
            imageUrl = uploadResult.imageUrl;
        }
        
        // Update the product
        const response = await fetch('/api/products', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                category,
                productId,
                name,
                description,
                price: price || null,
                imageUrl,
                password: '1234'
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Update local data
            const productIndex = productsData[category].findIndex(p => p.id === productId);
            if (productIndex !== -1) {
                productsData[category][productIndex] = result.product;
            }
            
            // Update display
            updateProductsDisplay();
            
            // Update search database if it's "other" category
            if (category === 'other') {
                const searchIndex = allProducts.findIndex(p => p.id === productId);
                if (searchIndex !== -1) {
                    allProducts[searchIndex] = {
                        name: result.product.name,
                        id: result.product.id,
                        keywords: generateSearchKeywords(result.product.name)
                    };
                }
            }
            
            // Clear form
            cancelEdit();
            
            // Show success message
            alert(`Product "${name}" updated successfully!`);
            
            // Go back to homepage
            navigateToSection('homepage');
        } else {
            alert(result.error || 'Failed to update product');
        }
    } catch (error) {
        alert('Failed to update product. Please check your connection and try again.');
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
    
    const priceHtml = product.price ? `<div class="product-price">$${parseFloat(product.price).toFixed(2)}</div>` : '';
    
    productCard.innerHTML = `
        ${imageHtml}
        <h3>${product.name}</h3>
        ${product.description ? `<p>${product.description}</p>` : ''}
        ${priceHtml}
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

// Setup ID search functionality
function setupIdSearch() {
    const idSearchInput = document.getElementById('id-search-input');
    const idSearchBtn = document.getElementById('id-search-btn');
    
    if (!idSearchInput || !idSearchBtn) return;
    
    function searchById() {
        const searchId = idSearchInput.value.trim();
        if (!searchId) {
            alert('Please enter a product ID');
            return;
        }
        
        // Search through all categories
        let foundProduct = null;
        let foundCategory = null;
        
        for (const [category, products] of Object.entries(productsData)) {
            const product = products.find(p => p.id === searchId);
            if (product) {
                foundProduct = product;
                foundCategory = category;
                break;
            }
        }
        
        if (foundProduct) {
            // Navigate to the category and highlight the product
            navigateToSection(foundCategory);
            setTimeout(() => {
                const productCard = document.querySelector(`[data-id="${searchId}"]`);
                if (productCard) {
                    productCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    productCard.style.animation = 'pulse 2s ease';
                    selectProduct(productCard);
                }
            }, 500);
            idSearchInput.value = '';
        } else {
            alert('Product with ID "' + searchId + '" not found');
        }
    }
    
    idSearchBtn.addEventListener('click', searchById);
    idSearchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchById();
        }
    });
}

// Setup homepage ID search functionality
function setupHomepageIdSearch() {
    const homepageIdSearch = document.getElementById('homepage-id-search');
    const homepageSearchBtn = document.getElementById('homepage-search-btn');
    
    function homepageSearchById() {
        const searchId = homepageIdSearch.value.trim();
        if (!searchId) {
            alert('Please enter a product ID');
            return;
        }
        
        // Search through all categories
        let foundProduct = null;
        let foundCategory = null;
        
        for (const [category, products] of Object.entries(productsData)) {
            const product = products.find(p => p.id === searchId);
            if (product) {
                foundProduct = product;
                foundCategory = category;
                break;
            }
        }
        
        if (foundProduct) {
            // Navigate to the category and highlight the product
            navigateToSection(foundCategory);
            setTimeout(() => {
                const productCard = document.querySelector(`[data-id="${searchId}"]`);
                if (productCard) {
                    productCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    productCard.style.animation = 'pulse 2s ease';
                    selectProduct(productCard);
                }
            }, 500);
            homepageIdSearch.value = '';
        } else {
            alert('Product with ID "' + searchId + '" not found');
        }
    }
    
    homepageSearchBtn.addEventListener('click', homepageSearchById);
    homepageIdSearch.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            homepageSearchById();
        }
    });
}

// Setup cart functionality
function setupCartFunctionality() {
    // Clear cart buttons
    document.querySelectorAll('[id$="-clear-cart"], #clear-cart').forEach(btn => {
        btn.addEventListener('click', function() {
            const sectionId = this.id.replace('-clear-cart', '').replace('clear-cart', 'other');
            clearCart(sectionId === 'clear' ? 'other' : sectionId);
        });
    });
}

// Update cart display
function updateCartDisplay(sectionId) {
    const products = selectedProducts[sectionId] || [];
    const cartItems = document.getElementById(sectionId === 'other' ? 'cart-items' : `${sectionId}-cart-items`);
    const cartCount = document.getElementById(sectionId === 'other' ? 'cart-count' : `${sectionId}-cart-count`);
    const clearBtn = document.getElementById(sectionId === 'other' ? 'clear-cart' : `${sectionId}-clear-cart`);
    const finishBtn = document.getElementById(sectionId === 'other' ? 'finish-btn' : `${sectionId}-finish-btn`);
    
    // Update count
    cartCount.textContent = products.length;
    
    // Update cart items
    cartItems.innerHTML = '';
    products.forEach(product => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <span>${product.name} (ID: ${product.id})</span>
            <button class="remove-item-btn" data-id="${product.id}">×</button>
        `;
        
        // Add remove functionality
        cartItem.querySelector('.remove-item-btn').addEventListener('click', function() {
            removeFromCart(sectionId, product.id);
        });
        
        cartItems.appendChild(cartItem);
    });
    
    // Show/hide buttons
    if (products.length > 0) {
        clearBtn.style.display = 'block';
        finishBtn.style.display = 'block';
        finishBtn.style.animation = 'fadeIn 0.5s ease';
    } else {
        clearBtn.style.display = 'none';
        finishBtn.style.display = 'none';
    }
}

// Remove item from cart
function removeFromCart(sectionId, productId) {
    if (!selectedProducts[sectionId]) return;
    
    const index = selectedProducts[sectionId].findIndex(p => p.id === productId);
    if (index !== -1) {
        selectedProducts[sectionId].splice(index, 1);
        
        // Remove visual selection from product card
        const productCard = document.querySelector(`[data-id="${productId}"]`);
        if (productCard) {
            productCard.classList.remove('selected');
        }
        
        updateCartDisplay(sectionId);
    }
}

// Clear entire cart
function clearCart(sectionId) {
    if (!selectedProducts[sectionId]) return;
    
    // Remove visual selection from all product cards
    selectedProducts[sectionId].forEach(product => {
        const productCard = document.querySelector(`[data-id="${product.id}"]`);
        if (productCard) {
            productCard.classList.remove('selected');
        }
    });
    
    selectedProducts[sectionId] = [];
    updateCartDisplay(sectionId);
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

// Setup Run All Images functionality
function setupRunAllImages() {
    const runAllImagesBtn = document.getElementById('run-all-images-btn');
    const syncResults = document.getElementById('sync-results');
    
    if (!runAllImagesBtn || !syncResults) return;
    
    runAllImagesBtn.addEventListener('click', async function() {
        const password = prompt('Enter admin password:');
        if (!password) return;
        
        // Show loading state
        const originalText = this.textContent;
        this.textContent = 'Running...';
        this.disabled = true;
        
        syncResults.innerHTML = 'Fetching images from ImageKit...';
        syncResults.classList.add('show');
        
        try {
            const response = await fetch('/api/run-all-images', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                let resultsHTML = `<div class="success">✓ Scan completed!</div>`;
                resultsHTML += `<div class="success">Total files in ImageKit: ${data.totalFiles}</div>`;
                resultsHTML += `<div class="success">Assigned files: ${data.assignedFiles}</div>`;
                resultsHTML += `<div class="warning">Unassigned files: ${data.unassignedFiles}</div><br>`;
                
                data.results.forEach(result => {
                    const className = result.type;
                    resultsHTML += `<div class="${className}">${result.message}</div>`;
                });
                
                syncResults.innerHTML = resultsHTML;
            } else {
                syncResults.innerHTML = `<div class="error">Error: ${data.error}</div>`;
            }
        } catch (error) {
            syncResults.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        } finally {
            // Restore button state
            this.textContent = originalText;
            this.disabled = false;
        }
    });
}
