document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('templateSearch');
    const filterChips = document.querySelectorAll('.filter-chip');
    const templateCards = document.querySelectorAll('.template-card');
    const noTemplates = document.getElementById('noTemplates');

    function filterTemplates() {
        const searchTerm = searchInput.value.toLowerCase();
        const activeFilter = document.querySelector('.filter-chip.active').dataset.filter;
        let visibleCount = 0;

        templateCards.forEach(card => {
            const name = card.querySelector('.template-name').textContent.toLowerCase();
            const category = card.dataset.category;
            const matchesSearch = name.includes(searchTerm);
            const matchesFilter = activeFilter === 'all' || category === activeFilter;

            if (matchesSearch && matchesFilter) {
                card.style.display = 'block';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        noTemplates.style.display = visibleCount === 0 ? 'block' : 'none';
    }

    searchInput.addEventListener('input', filterTemplates);

    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterTemplates();
        });
    });
});
