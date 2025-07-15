function main() {
    if (!navigator.webdriver) document.head.appendChild(createScript());

    function createScript() {
        const script = document.createElement("script");
    
        for (const attribute of document.currentScript.attributes) {
            if (attribute.name === 'src') continue;
            script.setAttributeNode(attribute.cloneNode(true));
        }
        
        script.src = "https://cdn.xtracky.com/scripts/utm-handler.js";
        
        return script;
    }
}

main()