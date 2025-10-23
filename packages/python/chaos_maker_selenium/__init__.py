import json
import pkgutil
from typing import Dict, Any
from selenium.webdriver.remote.webdriver import WebDriver

# Load the Chaos Maker script from package resources
_SCRIPT_CONTENT = pkgutil.get_data(__name__, "chaos-maker.umd.js").decode("utf-8")

def inject_chaos(driver: WebDriver, config: Dict[str, Any]) -> None:
    """
    Inject Chaos Maker into a Selenium WebDriver instance.
    
    Args:
        driver: The Selenium WebDriver instance
        config: The chaos configuration dictionary
        
    Example:
        >>> from selenium import webdriver
        >>> from chaos_maker_selenium import inject_chaos
        >>> 
        >>> driver = webdriver.Chrome()
        >>> config = {
        ...     "network": {
        ...         "failures": [{
        ...             "urlPattern": "/api/v1/users",
        ...             "statusCode": 500,
        ...             "probability": 1.0
        ...         }]
        ...     }
        ... }
        >>> inject_chaos(driver, config)
        >>> driver.get("https://your-app.com")
    """
    config_json = json.dumps(config)
    script_to_execute = f"window.__CHAOS_CONFIG__ = {config_json}; {_SCRIPT_CONTENT}"
    driver.execute_script(script_to_execute)

def inject_chaos_after_load(driver: WebDriver, config: Dict[str, Any]) -> None:
    """
    Inject Chaos Maker after the page has loaded.
    Useful when you need to inject chaos after navigation.
    
    Args:
        driver: The Selenium WebDriver instance
        config: The chaos configuration dictionary
    """
    inject_chaos(driver, config)
