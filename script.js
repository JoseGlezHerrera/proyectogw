let currentLanguage = 'es'; // Idioma inicial: español
const priceCache = {}; // Almacenar precios de materiales en caché
const itemDetailsCache = {}; // Almacenar detalles de ítems en caché

// Función para cambiar el idioma
function toggleLanguage() {
    currentLanguage = currentLanguage === 'es' ? 'en' : 'es'; // Alternar entre español e inglés
    document.getElementById("language-button").textContent = currentLanguage === 'es' ? 'Cambiar a Inglés' : 'Switch to Spanish';
    document.getElementById("crafting-title").textContent = currentLanguage === 'es' ? 'Objetos Crafteables' : 'Craftable Items';
    document.getElementById("search-button").textContent = currentLanguage === 'es' ? 'Buscar Objetos Crafteables' : 'Search Craftable Items';
    document.getElementById("placeholder-text").textContent = currentLanguage === 'es' ? 'Presiona el botón para buscar...' : 'Press the button to search...';
    fetchCraftableItems(); // Volver a cargar los datos con el nuevo idioma
}

// Función para obtener precios de múltiples materiales en una sola solicitud
async function getMaterialPrices(itemIds, retries = 3) {
    const batchSize = 100; // Límite de IDs por solicitud
    for (let i = 0; i < itemIds.length; i += batchSize) {
        const batch = itemIds.slice(i, i + batchSize);
        const pricesUrl = `https://api.guildwars2.com/v2/commerce/prices?ids=${batch.join(',')}`;
        try {
            const response = await fetch(pricesUrl);
            if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
            const priceData = await response.json();
            priceData.forEach(item => {
                priceCache[item.id] = item.sells?.unit_price || 0; // Usamos el precio de venta (sells)
            });
        } catch (error) {
            console.error("Error obteniendo precios de materiales:", error);
            if (retries > 0) {
                console.log(`Reintentando... (${retries} intentos restantes)`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
                return getMaterialPrices(batch, retries - 1);
            } else {
                console.warn("No se pudieron obtener los precios de los materiales después de varios intentos.");
                continue; // Omitir este lote y continuar con el siguiente
            }
        }
    }
}

// Función para obtener detalles de múltiples ítems en una sola solicitud
async function getItemDetails(itemIds) {
    const batchSize = 200; // Límite de IDs por solicitud
    for (let i = 0; i < itemIds.length; i += batchSize) {
        const batch = itemIds.slice(i, i + batchSize);
        const itemsUrl = `https://api.guildwars2.com/v2/items?ids=${batch.join(',')}&lang=${currentLanguage}`;
        try {
            const response = await fetch(itemsUrl);
            if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
            const itemsData = await response.json();
            itemsData.forEach(item => {
                itemDetailsCache[item.id] = item; // Almacenar detalles en caché
            });
        } catch (error) {
            console.error("Error obteniendo detalles de ítems:", error);
        }
    }
}

// Función para calcular el precio de crafteo de una receta
function calculateCraftingPrice(recipe) {
    let totalPrice = 0;
    for (const ingredient of recipe.ingredients) {
        const materialPrice = priceCache[ingredient.item_id] || 0;
        totalPrice += materialPrice * ingredient.count;
    }
    return totalPrice;
}

// Función para agregar una fila a la tabla
function addTableRow(tableBody, itemDetails, craftingPrice) {
    const priceInSilver = `${Math.floor(craftingPrice / 100)} 🟡 ${craftingPrice % 100} ⚪`;
    const tableRow = `
        <tr>
            <td>${itemDetails.name}</td>
            <td>${itemDetails.level}</td>
            <td>${itemDetails.rarity}</td>
            <td>${priceInSilver}</td>
        </tr>
    `;
    tableBody.innerHTML += tableRow;
}

// Función principal para buscar objetos crafteables
async function fetchCraftableItems() {
    console.log('Iniciando búsqueda de objetos crafteables...');
    const searchButton = document.getElementById("search-button");
    const placeholderText = document.getElementById("placeholder-text");
    const tableBody = document.getElementById("crafting-table");
    const loadingSpinner = document.getElementById("loading-spinner");

    placeholderText.textContent = currentLanguage === 'es' ? 'Buscando...' : 'Searching...';
    searchButton.textContent = currentLanguage === 'es' ? 'Buscando...' : 'Searching...';
    loadingSpinner.style.display = "block";
    tableBody.innerHTML = "";
    searchButton.disabled = true;

    const recipesUrl = "https://api.guildwars2.com/v2/recipes";
    const itemsUrl = "https://api.guildwars2.com/v2/items";
    const rarityFilter = ["Rare", "Exotic", "Ascended", "Legendary"];
    const typeFilter = ["Armor", "Weapon", "Trinket"];
    const maxCraftingPrice = 2000; // 20 platas en cobres

    try {
        console.log("Obteniendo lista de recetas...");
        const recipesResponse = await fetch(recipesUrl);
        if (!recipesResponse.ok) throw new Error("Error al obtener recetas");
        const recipeIds = await recipesResponse.json();
        if (!recipeIds || recipeIds.length === 0) {
            throw new Error("No se encontraron recetas en la API");
        }
        console.log(`Total de recetas obtenidas: ${recipeIds.length}`);

        // Procesar recetas en lotes de 200
        for (let i = 0; i < recipeIds.length; i += 200) {
            const batch = recipeIds.slice(i, i + 200);
            console.log(`Procesando lote ${i / 200 + 1} de ${Math.ceil(recipeIds.length / 200)}...`);

            const recipesDetailsResponse = await fetch(`${recipesUrl}?ids=${batch.join(',')}`);
            if (!recipesDetailsResponse.ok) {
                console.warn(`Error al obtener detalles del lote de recetas: ${recipesDetailsResponse.status}`);
                continue;
            }
            const recipesDetails = await recipesDetailsResponse.json();

            // Obtener todos los IDs de materiales únicos en este lote
            const materialIds = [...new Set(recipesDetails.flatMap(recipe => recipe.ingredients.map(i => i.item_id)))];
            await getMaterialPrices(materialIds); // Obtener precios de materiales en lotes más pequeños

            // Obtener detalles de los ítems en este lote
            const itemIds = recipesDetails.map(recipe => recipe.output_item_id);
            await getItemDetails(itemIds);

            // Procesar cada receta
            for (const recipe of recipesDetails) {
                const itemDetails = itemDetailsCache[recipe.output_item_id];

                // Verificar si itemDetails está definido
                if (!itemDetails) {
                    console.warn(`No se encontraron detalles para el ítem con ID: ${recipe.output_item_id}`);
                    continue; // Saltar esta receta si no hay detalles del ítem
                }

                // Filtrar por nivel, rareza y tipo
                if (itemDetails.level === 80 && rarityFilter.includes(itemDetails.rarity) && typeFilter.includes(itemDetails.type)) {
                    console.log(`Procesando ítem: ${itemDetails.name}`);
                    const craftingPrice = calculateCraftingPrice(recipe);

                    // Filtrar por precio máximo
                    if (craftingPrice > 0 && craftingPrice <= maxCraftingPrice) {
                        addTableRow(tableBody, itemDetails, craftingPrice);
                        console.log(`Ítem agregado a la tabla: ${itemDetails.name}`);
                    }
                }
            }
        }
        console.log('Búsqueda completada.');
    } catch (error) {
        console.error("Error buscando objetos crafteables:", error);
        document.getElementById("error-message").textContent = currentLanguage === 'es' ? 'Error al buscar objetos crafteables.' : 'Error searching for craftable items.';
    } finally {
        searchButton.textContent = currentLanguage === 'es' ? 'Buscar Objetos Crafteables' : 'Search Craftable Items';
        searchButton.disabled = false;
        loadingSpinner.style.display = "none";
    }
}

// Función para ordenar la tabla
function sortTable(columnIndex) {
    const table = document.querySelector("table");
    const tbody = table.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    const isAsc = table.querySelector(`th:nth-child(${columnIndex + 1})`).classList.toggle("asc");

    rows.sort((a, b) => {
        const aValue = a.cells[columnIndex].textContent;
        const bValue = b.cells[columnIndex].textContent;

        if (columnIndex === 1 || columnIndex === 3) { // Columnas numéricas
            return isAsc ? aValue - bValue : bValue - aValue;
        } else { // Columnas de texto
            return isAsc ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
    });

    tbody.innerHTML = "";
    rows.forEach(row => tbody.appendChild(row));
}
