#!/bin/sh
# Meldt bij het opstarten welke Services Kubernetes in deze namespace kent (de *_SERVICE_HOST-
# variabelen) en waar NLW_KERN naartoe wijst. Handig om de interne naam van de kerncontainer
# te vinden; het platform documenteert die niet.
echo "nlw-proxy: NLW_KERN=${NLW_KERN}"
echo "nlw-proxy: services in deze namespace:"
env | grep -E '_SERVICE_HOST=' | sort | sed 's/^/  /'
echo "nlw-proxy: resolv.conf:"
sed 's/^/  /' /etc/resolv.conf
