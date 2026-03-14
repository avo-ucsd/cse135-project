class SiteHeader extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <header role="banner">
                <nav aria-label="Primary navigation">
                <a href="index.html" class="wordmark">Team <strong>Ate</strong></a>
                <ul role="list">
                    <li><a href="index.html">Dashboard</a></li>
                    <li><a href="engagement.html">User Engagement</a></li>
                    <li><a href="performance.html">Performance</a></li>
                    <li><a href="errors.html">Errors</a></li>
                    <li><a href="reports.html">Reports</a></li>
                    <li><a href="manage-users.php">Manage Users</a></li>
                    <li><a href="raw.html">Raw Data</a></li>
                </ul>
                <form method="post" action="/logout.php" class="logout-form">
                    <button type="submit" class="btn-logout">Log out</button>
                </form>
                </nav>
            </header>
        `;

        const path = window.location.pathname.replace(/\\/g, '/');
        const file = path.split('/').pop() || 'index.html';
        const active = file === '' ? 'index.html' : file;
        this.querySelectorAll('nav ul a').forEach((a) => {
            const href = a.getAttribute('href') || '';
            if (href === active) {
                a.setAttribute('aria-current', 'page');
            } else {
                a.removeAttribute('aria-current');
            }
        });
    }
}

customElements.define('site-header', SiteHeader)