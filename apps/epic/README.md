Services involved
=================
debug-console
epic-interconnect
express-mongo-dump

Testing
=======
1. (make sure express-mongo-dump is up: sudo service express-mongo-dump start)
curl -X POST -H 'Content-Type:application/xml' -d @'hello.xml' 127.0.0.1:9000/dump/test1

2. (make sure hack-click-debug-console are up, port: 7891)
cd hack-click-debug-console
node server

3.
cd node-soap-hack-click/tests/express-mongo-dump
node index
