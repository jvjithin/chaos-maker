# Chaos Maker Selenium Integration

A Python package that provides seamless integration between Chaos Maker and Selenium WebDriver for automated resilience testing.

## Installation

```bash
pip install chaos-maker-selenium
```

## Usage

```python
from selenium import webdriver
from chaos_maker_selenium import inject_chaos

# Create your WebDriver instance
driver = webdriver.Chrome()

# Define your chaos configuration
config = {
    "network": {
        "failures": [
            {
                "urlPattern": "/api/v1/users",
                "statusCode": 500,
                "probability": 1.0
            }
        ]
    }
}

# Inject chaos into the browser
inject_chaos(driver, config)

# Navigate to your application
driver.get("https://your-app.com")

# Your test logic here...
# The chaos will be active during your test execution

driver.quit()
```

## Configuration

The configuration object follows the same format as the core Chaos Maker library:

- `network`: Network-level chaos (failures, latencies)
- `ui`: UI-level chaos (element assaults)

See the main Chaos Maker documentation for detailed configuration options.
