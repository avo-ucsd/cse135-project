class SiteHeader extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <header role="banner">
                <nav aria-label="Primary navigation">
                <a href="#" class="wordmark">Team <strong>Ate</strong></a>
                <ul role="list">
                    <li><a href="index.html" aria-current="page">Dashboard</a></li>
                    <li><a href="engagement.html">User Engagement</a></li>
                    <li><a href="performance.html">Performance</a></li>
                    <li><a href="errors.html">Errors</a></li>
                    <li><a href="raw.html">Raw Data</a></li>
                    <!-- <li><a href="traffic.html">Traffic</a></li>
                    <li><a href="reports.html">Reports</a></li> -->
                </ul>
                <form method="post" action="/logout.php" class="logout-form">
                    <button type="submit" class="btn-logout">Log out</button>
                </form>
                </nav>
            </header>
        `;
    }
}

customElements.define('site-header', SiteHeader)