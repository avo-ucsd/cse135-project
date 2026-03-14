class SiteHeader extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <header role="banner" class="navbar navbar-expand-lg">
                <nav aria-label="Primary navigation" class="container-xl">
                <a href="index.html" class="wordmark navbar-brand">Team <strong>Ate</strong></a>
                <ul role="list" class="navbar-nav flex-row flex-wrap gap-1 align-items-center">
                    <li class="nav-item"><a class="nav-link" href="index.html">Dashboard</a></li>
                    <li class="nav-item"><a class="nav-link" href="engagement.html">User Engagement</a></li>
                    <li class="nav-item"><a class="nav-link" href="performance.html">Performance</a></li>
                    <li class="nav-item"><a class="nav-link" href="errors.html">Errors</a></li>
                    <li class="nav-item"><a class="nav-link" href="reports.html">Reports</a></li>
                    <li class="nav-item"><a class="nav-link" href="manage-users.php">Manage Users</a></li>
                    <li class="nav-item"><a class="nav-link" href="raw.html">Raw Data</a></li>
                </ul>
                <form method="post" action="/logout.php" class="logout-form ms-auto">
                    <button type="submit" class="btn-logout btn btn-outline-light btn-sm">Log out</button>
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